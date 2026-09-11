import { Database } from "better-sqlite3";
import { MemberService } from "./member.service.js";
import { LevelService } from "./level.service.js";
import { HierarchyService } from "./hierarchy.service.js";
import { checkpointDatabase } from "../config/database.js";

export interface GeneratedEvent {
  id: string;
  name: string;
  level_name: string;
  parent_name: string;
  hierarchy_name: string;
  custom_data: Record<string, any>;
  timestamp: string;
}

export class RealtimeGeneratorService {
  private memberService: MemberService;
  private levelService: LevelService;
  private hierarchyService: HierarchyService;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private intervalMs: number = 2500;
  private recentEvents: GeneratedEvent[] = [];
  private totalGenerated: number = 0;

  constructor(private db: Database) {
    this.memberService = new MemberService(db);
    this.levelService = new LevelService(db);
    this.hierarchyService = new HierarchyService(db);
  }

  getStatus(): {
    isRunning: boolean;
    intervalMs: number;
    totalGenerated: number;
    recentEvents: GeneratedEvent[];
  } {
    return {
      isRunning: this.isRunning,
      intervalMs: this.intervalMs,
      totalGenerated: this.totalGenerated,
      recentEvents: this.recentEvents.slice(0, 30)
    };
  }

  start(intervalMs = 2500, targetHierarchyId?: string): void {
    if (this.isRunning) {
      this.stop();
    }

    this.intervalMs = Math.max(intervalMs, 1000);
    this.isRunning = true;

    this.timer = setInterval(() => {
      this.generateOne(targetHierarchyId).catch(err => {
        console.error("Real-time generation error:", err);
      });
    }, this.intervalMs);

    // Initial immediate tick
    this.generateOne(targetHierarchyId).catch(console.error);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    checkpointDatabase();
  }

  async generateBatch(count: number, hierarchyId?: string): Promise<GeneratedEvent[]> {
    const events: GeneratedEvent[] = [];
    const n = Math.min(Math.max(count, 1), 100);

    for (let i = 0; i < n; i++) {
      const ev = await this.generateOne(hierarchyId);
      if (ev) events.push(ev);
    }

    checkpointDatabase();
    return events;
  }

  async generateOne(hierarchyId?: string): Promise<GeneratedEvent | null> {
    const hierarchies = this.hierarchyService.getHierarchies();
    if (hierarchies.length === 0) return null;

    const targetH = hierarchyId
      ? hierarchies.find(h => h.id === hierarchyId) || hierarchies[0]
      : hierarchies[0];

    const levels = this.levelService.getLevels(targetH.id);
    if (levels.length < 2) return null;

    // Pick a level that has allowed parent levels (preferably a deeper level like students, marks, or tasks)
    const deepLevels = levels.filter(l => l.allowed_parent_level_ids && l.allowed_parent_level_ids.length > 0);
    if (deepLevels.length === 0) return null;

    // Favor the deepest level to create continuous leaf activity (e.g. marks, tasks, logs)
    const targetLevel = deepLevels[deepLevels.length - 1];
    const parentLevelId = targetLevel.allowed_parent_level_ids[0];

    // Find candidate parents in the parent level
    const parents = this.memberService.getRecords(parentLevelId, { limit: 50 });
    if (parents.items.length === 0) return null;

    const chosenParent = parents.items[Math.floor(Math.random() * parents.items.length)];
    const actor = { id: "realtime_generator", name: "Real-Time SQL Streamer" };

    // Generate realistic attributes based on level code/name
    const customData: Record<string, any> = {};
    const code = targetLevel.code.toLowerCase();
    const namePrefix = targetLevel.name.replace(/s$/, "");

    let memberName: string;
    const now = new Date();
    const timeStr = now.toLocaleTimeString();

    if (code.includes("mark") || code.includes("score") || code.includes("grade")) {
      const subjects = ["Mathematics", "Science", "English", "Computer Science", "History"];
      const subj = subjects[Math.floor(Math.random() * subjects.length)];
      const terms = ["Unit Test 1", "Mid Term", "Unit Test 2", "Final Exam"];
      const score = Math.floor(Math.random() * 41) + 60; // 60-100
      const passed = score >= 60;
      const grades = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : "C";

      customData.subject = subj;
      customData.term = terms[Math.floor(Math.random() * terms.length)];
      customData.score = score;
      customData.max_score = 100;
      customData.grade = grades;
      customData.passed = passed;

      memberName = `${subj} Assessment (${timeStr})`;
    } else if (code.includes("task") || code.includes("proj")) {
      const tasks = ["Security Audit", "API Benchmarking", "Data Sync", "Schema Update", "Cache Invalidation"];
      const t = tasks[Math.floor(Math.random() * tasks.length)];
      customData.est_hours = Math.floor(Math.random() * 20) + 5;
      customData.is_completed = Math.random() > 0.4;
      memberName = `${t} - Batch #${Math.floor(Math.random() * 900 + 100)}`;
    } else {
      const index = Math.floor(Math.random() * 9000 + 1000);
      memberName = `${namePrefix} #${index} (${timeStr})`;
      customData.generated_at = now.toISOString();
    }

    // Persist immediately into SQL database
    const created = this.memberService.createRecord(
      {
        hierarchy_id: targetH.id,
        level_id: targetLevel.id,
        parent_id: chosenParent.id,
        name: memberName,
        custom_data: customData
      },
      actor
    );

    const event: GeneratedEvent = {
      id: created.id,
      name: created.name,
      level_name: targetLevel.name,
      parent_name: chosenParent.name,
      hierarchy_name: targetH.name,
      custom_data: created.custom_data,
      timestamp: now.toISOString()
    };

    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 50) {
      this.recentEvents.pop();
    }
    this.totalGenerated++;

    return event;
  }
}

let generatorInstance: RealtimeGeneratorService | null = null;

export function getRealtimeGenerator(db: Database): RealtimeGeneratorService {
  if (!generatorInstance) {
    generatorInstance = new RealtimeGeneratorService(db);
  }
  return generatorInstance;
}
