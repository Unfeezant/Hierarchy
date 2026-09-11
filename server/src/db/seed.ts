import { getDatabase } from "../config/database.js";
import { initSchema } from "./schema.js";
import { AuthService } from "../services/auth.service.js";
import { HierarchyService } from "../services/hierarchy.service.js";
import { LevelService } from "../services/level.service.js";
import { FieldService } from "../services/field.service.js";
import { MemberService } from "../services/member.service.js";

export function runSeed(targetDbPath?: string) {
  const db = getDatabase(targetDbPath);
  initSchema(db);

  const authService = new AuthService(db);
  authService.seedDefaultRolesAndPermissions();

  const hierarchyService = new HierarchyService(db);
  const levelService = new LevelService(db);
  const fieldService = new FieldService(db);
  const memberService = new MemberService(db);

  // Check if already seeded
  const existingHierarchy = db.prepare("SELECT id FROM hierarchies WHERE name = ?").get("Educational Pyramid Demonstration");
  if (existingHierarchy) {
    console.log("Database already seeded with demo data.");
    return;
  }

  console.log("Seeding canonical database...");

  // 1. Initial System Actor for Demo Seeds (No default admin credentials seeded)
  const adminActor = { id: "system_initializer", name: "System Initializer" };

  // 2. Create Educational Hierarchy
  const eduHierarchy = hierarchyService.createHierarchy(
    {
      name: "Educational Pyramid Demonstration",
      description: "Demonstration of deep dynamic hierarchy: Head -> Schools -> Principals -> Teachers -> Classes -> Students -> Subject Marks"
    },
    adminActor
  );

  // 3. Create Dynamic Levels
  const lvlHead = levelService.createLevel(
    eduHierarchy.id,
    {
      name: "Head",
      code: "head",
      description: "Apex governing body or board",
      icon: "Landmark",
      color: "#6366f1",
      depth_order: 0,
      allowed_parent_level_ids: []
    },
    adminActor
  );

  const lvlSchool = levelService.createLevel(
    eduHierarchy.id,
    {
      name: "Schools",
      code: "school",
      description: "Educational institutions",
      icon: "School",
      color: "#3b82f6",
      depth_order: 1,
      allowed_parent_level_ids: [lvlHead.id]
    },
    adminActor
  );

  const lvlPrincipal = levelService.createLevel(
    eduHierarchy.id,
    {
      name: "Principals",
      code: "principal",
      description: "School executive leadership",
      icon: "UserCheck",
      color: "#0ea5e9",
      depth_order: 2,
      allowed_parent_level_ids: [lvlSchool.id]
    },
    adminActor
  );

  const lvlTeacher = levelService.createLevel(
    eduHierarchy.id,
    {
      name: "Teachers",
      code: "teacher",
      description: "Teaching and departmental staff",
      icon: "GraduationCap",
      color: "#10b981",
      depth_order: 3,
      allowed_parent_level_ids: [lvlPrincipal.id]
    },
    adminActor
  );

  const lvlClass = levelService.createLevel(
    eduHierarchy.id,
    {
      name: "Classes",
      code: "class",
      description: "Sections and cohorts",
      icon: "BookOpen",
      color: "#f59e0b",
      depth_order: 4,
      allowed_parent_level_ids: [lvlTeacher.id]
    },
    adminActor
  );

  const lvlStudent = levelService.createLevel(
    eduHierarchy.id,
    {
      name: "Students",
      code: "student",
      description: "Enrolled pupils",
      icon: "Users",
      color: "#ec4899",
      depth_order: 5,
      allowed_parent_level_ids: [lvlClass.id]
    },
    adminActor
  );

  const lvlMark = levelService.createLevel(
    eduHierarchy.id,
    {
      name: "Subject Marks",
      code: "mark",
      description: "Examinations and graded evaluations",
      icon: "Award",
      color: "#8b5cf6",
      depth_order: 6,
      allowed_parent_level_ids: [lvlStudent.id]
    },
    adminActor
  );

  // 4. Create Dynamic Schema / Field Definitions
  // Head Fields
  fieldService.createField(lvlHead.id, { name: "Jurisdiction", key: "jurisdiction", field_type: "text", is_required: true }, adminActor);
  fieldService.createField(lvlHead.id, { name: "Official Email", key: "official_email", field_type: "email" }, adminActor);

  // School Fields
  fieldService.createField(lvlSchool.id, { name: "School Code", key: "code", field_type: "text", is_required: true }, adminActor);
  fieldService.createField(lvlSchool.id, { name: "Address", key: "address", field_type: "text" }, adminActor);
  fieldService.createField(lvlSchool.id, { name: "Contact Phone", key: "phone", field_type: "phone" }, adminActor);
  fieldService.createField(lvlSchool.id, { name: "Established Year", key: "est_year", field_type: "number" }, adminActor);

  // Principal Fields
  fieldService.createField(lvlPrincipal.id, { name: "Employee ID", key: "emp_id", field_type: "text", is_required: true }, adminActor);
  fieldService.createField(lvlPrincipal.id, { name: "Qualification", key: "qualification", field_type: "text" }, adminActor);
  fieldService.createField(lvlPrincipal.id, { name: "Joining Date", key: "joining_date", field_type: "date" }, adminActor);

  // Teacher Fields
  fieldService.createField(lvlTeacher.id, { name: "Employee ID", key: "emp_id", field_type: "text", is_required: true }, adminActor);
  fieldService.createField(lvlTeacher.id, {
    name: "Department",
    key: "department",
    field_type: "single_select",
    options: ["Mathematics", "Science", "English", "Social Studies", "Arts", "Physical Education"],
    is_required: true
  }, adminActor);
  fieldService.createField(lvlTeacher.id, { name: "Qualification", key: "qualification", field_type: "text" }, adminActor);
  fieldService.createField(lvlTeacher.id, { name: "Email", key: "email", field_type: "email" }, adminActor);
  fieldService.createField(lvlTeacher.id, { name: "Salary", key: "salary", field_type: "number" }, adminActor);

  // Class Fields
  fieldService.createField(lvlClass.id, { name: "Room Number", key: "room_no", field_type: "text" }, adminActor);
  fieldService.createField(lvlClass.id, {
    name: "Section",
    key: "section",
    field_type: "single_select",
    options: ["Section A", "Section B", "Section C"]
  }, adminActor);
  fieldService.createField(lvlClass.id, { name: "Capacity", key: "capacity", field_type: "number" }, adminActor);

  // Student Fields
  fieldService.createField(lvlStudent.id, { name: "Admission Number", key: "adm_no", field_type: "text", is_required: true }, adminActor);
  fieldService.createField(lvlStudent.id, { name: "Date of Birth", key: "dob", field_type: "date" }, adminActor);
  fieldService.createField(lvlStudent.id, {
    name: "Gender",
    key: "gender",
    field_type: "single_select",
    options: ["Male", "Female", "Other"]
  }, adminActor);
  fieldService.createField(lvlStudent.id, { name: "Parent/Guardian", key: "guardian", field_type: "text" }, adminActor);
  fieldService.createField(lvlStudent.id, { name: "Emergency Contact", key: "emergency_contact", field_type: "phone" }, adminActor);

  // Mark Fields
  fieldService.createField(lvlMark.id, {
    name: "Subject",
    key: "subject",
    field_type: "single_select",
    options: ["Mathematics", "Science", "English", "History", "Computer Science"],
    is_required: true
  }, adminActor);
  fieldService.createField(lvlMark.id, {
    name: "Exam Term",
    key: "term",
    field_type: "single_select",
    options: ["Unit Test 1", "Mid Term", "Unit Test 2", "Final Exam"]
  }, adminActor);
  fieldService.createField(lvlMark.id, { name: "Score", key: "score", field_type: "number", is_required: true }, adminActor);
  fieldService.createField(lvlMark.id, { name: "Max Score", key: "max_score", field_type: "number", default_value: "100" }, adminActor);
  fieldService.createField(lvlMark.id, {
    name: "Grade",
    key: "grade",
    field_type: "single_select",
    options: ["A+", "A", "B+", "B", "C", "D", "F"]
  }, adminActor);
  fieldService.createField(lvlMark.id, { name: "Passed", key: "passed", field_type: "boolean" }, adminActor);

  // 5. Seed Canonical Records
  // Level 0: Head
  const headRecord = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlHead.id,
    parent_id: null,
    name: "National Education Directorate",
    custom_data: { jurisdiction: "Federal / National", official_email: "directorate@education.gov" }
  }, adminActor);

  // Level 1: Schools
  const schoolA = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlSchool.id,
    parent_id: headRecord.id,
    name: "School A - Central Academy",
    custom_data: { code: "SCH-001", address: "104 Academic Avenue, Metro City", phone: "+1-555-0101", est_year: 1995 }
  }, adminActor);

  const schoolB = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlSchool.id,
    parent_id: headRecord.id,
    name: "School B - Greenfield International",
    custom_data: { code: "SCH-002", address: "88 Pine Forest Way, Greenfield", phone: "+1-555-0102", est_year: 2008 }
  }, adminActor);

  // Level 2: Principals
  const principalA = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlPrincipal.id,
    parent_id: schoolA.id,
    name: "Principal Arthur Pendelton",
    custom_data: { emp_id: "EMP-P001", qualification: "Ph.D. in Educational Leadership", joining_date: "2015-06-01" }
  }, adminActor);

  const principalB = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlPrincipal.id,
    parent_id: schoolB.id,
    name: "Principal Barbara Gordon",
    custom_data: { emp_id: "EMP-P002", qualification: "M.Ed., Harvard University", joining_date: "2018-09-15" }
  }, adminActor);

  // Level 3: Teachers under Principal A
  const teacherA = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlTeacher.id,
    parent_id: principalA.id,
    name: "Teacher Alan Turing",
    custom_data: { emp_id: "T-101", department: "Mathematics", qualification: "M.Sc. Mathematics", email: "alan.turing@central.edu", salary: 75000 }
  }, adminActor);

  const teacherB = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlTeacher.id,
    parent_id: principalA.id,
    name: "Teacher Beatrice Webb",
    custom_data: { emp_id: "T-102", department: "Science", qualification: "M.Sc. Physics", email: "b.webb@central.edu", salary: 72000 }
  }, adminActor);

  // Teacher under Principal B
  const teacherC = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlTeacher.id,
    parent_id: principalB.id,
    name: "Teacher Clara Oswald",
    custom_data: { emp_id: "T-201", department: "English", qualification: "M.A. English Literature", email: "clara.o@greenfield.edu", salary: 68000 }
  }, adminActor);

  // Level 4: Classes under Teacher Alan Turing
  const class10A = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlClass.id,
    parent_id: teacherA.id,
    name: "Class 10A",
    custom_data: { room_no: "Room 201", section: "Section A", capacity: 35 }
  }, adminActor);

  const class10B = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlClass.id,
    parent_id: teacherA.id,
    name: "Class 10B",
    custom_data: { room_no: "Room 202", section: "Section B", capacity: 30 }
  }, adminActor);

  // Level 4: Class under Teacher Beatrice Webb
  const class11Sci = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlClass.id,
    parent_id: teacherB.id,
    name: "Class 11 Science",
    custom_data: { room_no: "Science Lab 3", section: "Section A", capacity: 28 }
  }, adminActor);

  // Level 5: Students under Class 10A
  const student1 = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlStudent.id,
    parent_id: class10A.id,
    name: "Student Alice Johnson",
    custom_data: { adm_no: "ADM-2026-001", dob: "2010-04-12", gender: "Female", guardian: "Robert Johnson", emergency_contact: "+1-555-4401" }
  }, adminActor);

  const student2 = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlStudent.id,
    parent_id: class10A.id,
    name: "Student Bob Smith",
    custom_data: { adm_no: "ADM-2026-002", dob: "2010-08-23", gender: "Male", guardian: "Sarah Smith", emergency_contact: "+1-555-4402" }
  }, adminActor);

  // Level 5: Student under Class 10B
  const student3 = memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlStudent.id,
    parent_id: class10B.id,
    name: "Student Charlie Brown",
    custom_data: { adm_no: "ADM-2026-003", dob: "2010-11-05", gender: "Male", guardian: "Linus Brown", emergency_contact: "+1-555-4403" }
  }, adminActor);

  // Level 6: Subject Marks for Student Alice Johnson
  memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlMark.id,
    parent_id: student1.id,
    name: "Math Mid-Term (Alice)",
    custom_data: { subject: "Mathematics", term: "Mid Term", score: 96, max_score: 100, grade: "A+", passed: true }
  }, adminActor);

  memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlMark.id,
    parent_id: student1.id,
    name: "Science Mid-Term (Alice)",
    custom_data: { subject: "Science", term: "Mid Term", score: 88, max_score: 100, grade: "A", passed: true }
  }, adminActor);

  // Marks for Student Bob Smith
  memberService.createRecord({
    hierarchy_id: eduHierarchy.id,
    level_id: lvlMark.id,
    parent_id: student2.id,
    name: "Math Mid-Term (Bob)",
    custom_data: { subject: "Mathematics", term: "Mid Term", score: 74, max_score: 100, grade: "B", passed: true }
  }, adminActor);

  // Guest accounts are created dynamically or accessed via Guest Links

  console.log("Canonical database seeded successfully!");
}

if (!process.env.VITEST && process.env.NODE_ENV !== "test") {
  runSeed();
}
