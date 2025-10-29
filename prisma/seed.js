// File: BACKEND/prisma/seed.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  // 1. Create default roles
  const roles = [{ name: "admin" }, { name: "trainer" }, { name: "trainee" }];
  for (const roleData of roles) {
    await prisma.role.upsert({
      where: { name: roleData.name },
      update: {},
      create: roleData,
    });
  }

  // 2. Create default capabilities
  const capabilities = [
    // User Profile Management
    { name: "view_own_profile", category: "profile" },
    { name: "update_own_profile", category: "profile" },
    { name: "upload_profile_photo", category: "profile" },
    // User Directory & Administration
    { name: "search_users", category: "user administration" },
    { name: "create_user", category: "user administration" },
    { name: "view_all_users", category: "user administration" },
    { name: "view_user_by_id", category: "user administration" },
    { name: "update_user", category: "user administration" },
    { name: "delete_user", category: "user administration" },
    { name: "change_user_role", category: "user administration" },
    // Role & Permission Management
    { name: "view_roles", category: "role management" },
    { name: "view_capabilities", category: "role management" },
    { name: "create_roles", category: "role management" },
    { name: "create_capabilities", category: "role management" },
    { name: "assign_capabilities_to_role", category: "role management" },
    // Course Catalog & Management
    { name: "view_courses", category: "course catalog" },
    { name: "view_single_course", category: "course catalog" },
    { name: "create_courses", category: "course management" },
    { name: "update_course", category: "course management" },
    { name: "delete_course", category: "course management" },
    // Enrollment Control
    { name: "enroll_courses", category: "enrollment" },
    { name: "view_enrolled_courses_by_user_id", category: "enrollment" },
    { name: "unenroll_courses", category: "enrollment" },
    // Course Categories
    { name: "view_course_categories", category: "course organization" },
    { name: "create_course_categories", category: "course organization" },
    // Module & Lesson Management
    { name: "view_modules", category: "module management" },
    { name: "create_modules", category: "module management" },
    { name: "get_single_module", category: "module management" },
    { name: "update_module", category: "module management" },
    { name: "delete_module", category: "module management" },
    { name: "reorder_module", category: "module management" },
    { name: "update_module_completion_status", category: "module management" },
    // Assessment Admin
    { name: "create_assessments", category: "assessment admin" },
    { name: "view_assessments", category: "assessment admin" },
    { name: "view_assessment_by_id", category: "assessment admin" },
    { name: "update_assessments", category: "assessment admin" },
    { name: "delete_assessments", category: "assessment admin" },
    { name: "toggle_assessment_status", category: "assessment admin" },
    { name: "duplicate_assessment", category: "assessment admin" },
    { name: "add_question_to_assessment", category: "assessment admin" },
    { name: "update_question", category: "assessment admin" },
    { name: "delete_question", category: "assessment admin" },
    // Assessment Analytics
    { name: "view_assessment_analytics", category: "assessment analytics" },
    { name: "view_assessments_submissions", category: "assessment analytics" },
    { name: "view_assessment_analytics_courselevel", category: "assessment analytics" },
    // Assessment Grading
    { name: "pending_grading", category: "assessment grading" },
    { name: "give_grade_to_questions", category: "assessment grading" },
    // Assessment Participation
    { name: "view_all_enrolled_assessment", category: "assessment participation" },
    { name: "view_enrolled_assessment_by_id", category: "assessment participation" },
    { name: "start_taking_assessment", category: "assessment participation" },
    { name: "save_answer", category: "assessment participation" },
    { name: "submit_assessment", category: "assessment participation" },
    { name: "get_user_result", category: "assessment participation" },
    { name: "review_submission", category: "assessment participation" },
    { name: "view_assessment_progress", category: "assessment participation" }
  ];

  for (const cap of capabilities) {
    await prisma.capability.upsert({
      where: { name: cap.name },
      update: { category: cap.category },
      create: cap,
    });
  }

  // 3. Assign capabilities to roles
  const adminRole = await prisma.role.findUnique({ where: { name: "admin" } });
  const trainerRole = await prisma.role.findUnique({ where: { name: "trainer" } });
  const traineeRole = await prisma.role.findUnique({ where: { name: "trainee" } });
  const allCaps = await prisma.capability.findMany();

  // Assign all to admin
  for (const cap of allCaps) {
    await prisma.roleCapability.upsert({
      where: { roleId_capabilityId: { roleId: adminRole.id, capabilityId: cap.id } },
      update: {},
      create: { roleId: adminRole.id, capabilityId: cap.id },
    });
  }

  // Trainer: GRANTS (update these as your policy evolves)
  const trainerCaps = [
    "view_courses",
    "view_single_course",
    "create_courses",
    "update_course",
    "enroll_courses",
    "view_modules",
    "create_modules",
    "update_module",
    "view_assessments",
    "create_assessments",
    "update_assessments",
    "add_question_to_assessment",
    "update_question",
    "view_own_profile",
    "update_own_profile",
    "upload_profile_photo"
  ];
  for (const name of trainerCaps) {
    const cap = allCaps.find((c) => c.name === name);
    if (cap) {
      await prisma.roleCapability.upsert({
        where: { roleId_capabilityId: { roleId: trainerRole.id, capabilityId: cap.id } },
        update: {},
        create: { roleId: trainerRole.id, capabilityId: cap.id },
      });
    }
  }

  // Trainee: GRANTS
  const traineeCaps = [
    "view_courses",
    "view_single_course",
    "get_single_module",
    "view_modules",
    "view_all_enrolled_assessment",
    "start_taking_assessment",
    "save_answer",
    "submit_assessment",
    "get_user_result",
    "review_submission",
    "view_assessment_progress",
    "view_own_profile",
    "update_own_profile",
    "upload_profile_photo"
  ];
  for (const name of traineeCaps) {
    const cap = allCaps.find((c) => c.name === name);
    if (cap) {
      await prisma.roleCapability.upsert({
        where: { roleId_capabilityId: { roleId: traineeRole.id, capabilityId: cap.id } },
        update: {},
        create: { roleId: traineeRole.id, capabilityId: cap.id },
      });
    }
  }

  // 4. Create sample users (with profile fields)
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      password: "password",
      roleId: adminRole.id,
      fullName: "Admin User",
      phoneNumber: "+91-9999999999",
      designation: "System Administrator",
    },
  });
  const trainerUser = await prisma.user.upsert({
    where: { email: "trainer@example.com" },
    update: {},
    create: {
      email: "trainer@example.com",
      password: "password",
      roleId: trainerRole.id,
      fullName: "Trainer User",
      phoneNumber: "+91-8888888888",
      designation: "Senior Trainer",
    },
  });
  const traineeUser = await prisma.user.upsert({
    where: { email: "trainee@example.com" },
    update: {},
    create: {
      email: "trainee@example.com",
      password: "password",
      roleId: traineeRole.id,
      fullName: "Trainee User",
      phoneNumber: "+91-7777777777",
      designation: "Student",
    },
  });

  // 5. Create sample course (if not exists) and enroll trainee
  let course = await prisma.course.findFirst({
    where: { title: "Sample Course" },
  });
  if (!course) {
    course = await prisma.course.create({
      data: {
        title: "Sample Course",
        description: "An example course",
        createdById: trainerUser.id,
      },
    });
  }
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: traineeUser.id, courseId: course.id } },
    update: {},
    create: {
      userId: traineeUser.id,
      courseId: course.id,
      enrolledById: trainerUser.id,
    },
  });

  // 6. Create sample assessment (if not exists)
  let assessment = await prisma.assessment.findFirst({
    where: { title: "Sample Quiz", courseId: course.id },
  });
  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        title: "Sample Quiz",
        description: "Simple quiz",
        courseId: course.id,
        timeLimit: 10,
        totalMarks: 10,
        passingMarks: 5,
        attempts: 1,
        randomizeQuestions: false,
        showResults: true,
        allowReview: true,
      },
    });
  }

  // 7. Create questions (if not exists)
  const q1 = await prisma.question.findFirst({
    where: { assessmentId: assessment.id, questionText: "What is 2+2?" },
  });
  if (!q1) {
    await prisma.question.create({
      data: {
        assessmentId: assessment.id,
        questionText: "What is 2+2?",
        questionType: "MULTIPLE_CHOICE",
        marks: 5,
        order: 1,
        options: {
          create: [
            { optionText: "3", isCorrect: false, order: 1 },
            { optionText: "4", isCorrect: true, order: 2 },
            { optionText: "5", isCorrect: false, order: 3 },
          ],
        },
      },
    });
  }

  const q2 = await prisma.question.findFirst({
    where: {
      assessmentId: assessment.id,
      questionText: "True or False: The sky is green.",
    },
  });
  if (!q2) {
    await prisma.question.create({
      data: {
        assessmentId: assessment.id,
        questionText: "True or False: The sky is green.",
        questionType: "TRUE_FALSE",
        marks: 5,
        order: 2,
        options: {
          create: [
            { optionText: "True", isCorrect: false, order: 1 },
            { optionText: "False", isCorrect: true, order: 2 },
          ],
        },
      },
    });
  }

  console.log("✅ Seeding complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
