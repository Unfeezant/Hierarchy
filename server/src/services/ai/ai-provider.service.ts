import http from 'http';
import { AI_CONFIG } from '../../config/ai.config.js';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class AiProviderService {
  private static cachedModel: string | null = null;
  private static lastHealthCheck: number = 0;

  private static isOpenAiCompatible(): boolean {
    return Boolean(AI_CONFIG.apiKey) || AI_CONFIG.provider === "nvidia" || AI_CONFIG.provider === "openai" || AI_CONFIG.provider === "groq";
  }

  /**
   * Retrieve available models from NVIDIA/OpenAI-compatible or local Ollama.
   */
  public static async getAvailableModels(): Promise<string[]> {
    if (this.isOpenAiCompatible()) {
      try {
        const cleanBase = AI_CONFIG.baseUrl.replace(/\/+$/, "");
        const url = cleanBase.endsWith("/v1") ? `${cleanBase}/models` : `${cleanBase}/v1/models`;
        const headers: Record<string, string> = {};
        if (AI_CONFIG.apiKey) {
          headers["Authorization"] = `Bearer ${AI_CONFIG.apiKey}`;
        }
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
        if (!res.ok) return [AI_CONFIG.defaultModel];
        const data: any = await res.json();
        const list = (data.data || []).map((m: any) => m.id || m.name).filter(Boolean);
        return list.length > 0 ? list : [AI_CONFIG.defaultModel];
      } catch (e) {
        return [AI_CONFIG.defaultModel];
      }
    }

    try {
      const url = new URL('/api/tags', AI_CONFIG.baseUrl);
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.models || []).map((m: any) => m.name || m.model);
    } catch (e) {
      return [];
    }
  }

  /**
   * Automatically resolve the best available model.
   */
  public static async resolveActiveModel(): Promise<string> {
    if (this.isOpenAiCompatible()) {
      return AI_CONFIG.defaultModel;
    }

    const now = Date.now();
    if (this.cachedModel && (now - this.lastHealthCheck < 60000)) {
      return this.cachedModel;
    }

    const available = await this.getAvailableModels();
    if (available.length === 0) {
      return AI_CONFIG.defaultModel;
    }

    for (const pref of AI_CONFIG.preferredModels) {
      if (pref && available.some(m => m === pref || m.startsWith(pref))) {
        this.cachedModel = pref;
        this.lastHealthCheck = now;
        return pref;
      }
    }

    const qwenModel = available.find(m => m.toLowerCase().includes('qwen'));
    if (qwenModel) {
      this.cachedModel = qwenModel;
      this.lastHealthCheck = now;
      return qwenModel;
    }

    this.cachedModel = available[0] || AI_CONFIG.defaultModel;
    this.lastHealthCheck = now;
    return this.cachedModel;
  }

  /**
   * Send a chat completion request to NVIDIA / OpenAI-compatible endpoint or local Ollama.
   */
  public static async chat(options: {
    systemPrompt: string;
    messages: ProviderMessage[];
    formatJson?: boolean;
    temperature?: number;
    model?: string;
    maxTokens?: number;
  }): Promise<{ content: string; model: string }> {
    const modelToUse = options.model || await this.resolveActiveModel();
    const temperature = options.temperature ?? AI_CONFIG.temperature;

    const messages = [
      { role: 'system', content: options.systemPrompt },
      ...options.messages
    ];

    if (this.isOpenAiCompatible()) {
      const cleanBase = AI_CONFIG.baseUrl.replace(/\/+$/, "");
      const chatUrl = cleanBase.endsWith("/v1") 
        ? `${cleanBase}/chat/completions` 
        : `${cleanBase}/v1/chat/completions`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      if (AI_CONFIG.apiKey) {
        headers['Authorization'] = `Bearer ${AI_CONFIG.apiKey}`;
      }

      // If primary model experiences queue delays, try fast fallback
      const candidateModels = [
        modelToUse,
        "meta/llama-3.2-11b-vision-instruct",
        "deepseek-ai/deepseek-v4-flash-0731"
      ].filter((m, i, arr) => m && arr.indexOf(m) === i);

      let lastError: any = null;
      for (const candidate of candidateModels) {
        const bodyPayload: any = {
          model: candidate,
          messages,
          temperature,
          max_tokens: options.maxTokens ?? 1024,
          stream: false
        };

        if (options.formatJson && !candidate.toLowerCase().includes('deepseek')) {
          bodyPayload.response_format = { type: 'json_object' };
        }

        const t0 = Date.now();
        console.log(`[AI DISPATCH] Model: ${candidate} | URL: ${chatUrl}`);
        try {
          const timeout = candidate.toLowerCase().includes('deepseek') ? 20000 : 15000;
          const response = await fetch(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(bodyPayload),
            signal: AbortSignal.timeout(timeout)
          });
          console.log(`[AI RESPONSE] Model: ${candidate} | Status: ${response.status} (${Date.now() - t0}ms)`);

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`AI Provider error (${response.status}): ${errText}`);
          }

          const data: any = await response.json();
          const msg = data.choices?.[0]?.message;
          const content = (msg?.content || msg?.reasoning_content || "").trim();
          if (content) {
            return { content, model: candidate };
          }
        } catch (err: any) {
          console.warn(`[AI RETRY] Model ${candidate} encountered: ${err.message}. Trying next model...`);
          lastError = err;
        }
      }

      throw lastError || new Error("All AI provider candidates failed.");
    }

    // Local Ollama fallback
    const bodyPayload: any = {
      model: modelToUse,
      messages,
      stream: false,
      options: {
        temperature,
        num_predict: AI_CONFIG.maxTokens
      }
    };

    if (options.formatJson) {
      bodyPayload.format = 'json';
    }

    const url = new URL('/api/chat', AI_CONFIG.baseUrl);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(AI_CONFIG.timeoutMs)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI Provider error (${response.status}): ${errText}`);
    }

    const data: any = await response.json();
    const content = data.message?.content || "";

    return { content, model: modelToUse };
  }

  /**
   * Send chat completion and parse structured JSON.
   */
  public static async chatJson<T = any>(options: {
    systemPrompt: string;
    messages: ProviderMessage[];
    temperature?: number;
    model?: string;
  }): Promise<{ data: T; rawContent: string; model: string }> {
    const result = await this.chat({
      ...options,
      formatJson: true
    });

    let cleaned = result.content.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    try {
      const data = JSON.parse(cleaned) as T;
      return { data, rawContent: result.content, model: result.model };
    } catch (parseErr: any) {
      throw new Error(`Failed to parse AI JSON response: ${parseErr.message}\nRaw output: ${result.content.slice(0, 300)}`);
    }
  }
}
