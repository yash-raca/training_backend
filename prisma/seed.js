// File: BACKEND/prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Create default roles
  const roles = [
    { name: 'admin' },
    { name: 'trainer' },
    { name: 'trainee' },
  ];
  for (const roleData of roles) {
    await prisma.role.upsert({
      where: { name: roleData.name },
      update: {},
      create: roleData,
    });
  }

  // 2. Create default capabilities
  const capabilities = [
    // course & module caps
    'view_courses','view_single_course','create_courses','update_course','delete_course',
    'enroll_courses','unenroll_courses','view_modules','create_modules','get_single_module',
    'update_module','delete_module','reorder_module','update_module_completion_status',
    // role & capability management
    'view_roles','view_capabilities','create_roles','create_capabilities','assign_capabilities_to_role',
    'view_course_categories','create_course_categories','view_enrolled_courses_by_user_id',
    // user management caps (NEW - unique per endpoint)
    'create_user','view_all_users','view_user_by_id','update_user','delete_user',
    'search_users','change_user_role',
    // user profile caps (NEW)
    'view_own_profile','update_own_profile',
    // assessment caps
    'view_assessments','manage_assessments'
  ];
  for (const name of capabilities) {
    await prisma.capability.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // 3. Assign capabilities to roles
  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  const trainerRole = await prisma.role.findUnique({ where: { name: 'trainer' } });
  const traineeRole = await prisma.role.findUnique({ where: { name: 'trainee' } });
  const allCaps = await prisma.capability.findMany();

  // Assign all to admin
  for (const cap of allCaps) {
    await prisma.roleCapability.upsert({
      where: { roleId_capabilityId: { roleId: adminRole.id, capabilityId: cap.id } },
      update: {},
      create: { roleId: adminRole.id, capabilityId: cap.id },
    });
  }

  // Trainer: selected caps
  const trainerCaps = [
    'view_courses','view_single_course','create_courses','update_course',
    'enroll_courses','view_modules','create_modules','update_module',
    'view_assessments','manage_assessments',
    'view_own_profile','update_own_profile'
  ];
  for (const name of trainerCaps) {
    const cap = allCaps.find(c => c.name === name);
    if (cap) {
      await prisma.roleCapability.upsert({
        where: { roleId_capabilityId: { roleId: trainerRole.id, capabilityId: cap.id } },
        update: {},
        create: { roleId: trainerRole.id, capabilityId: cap.id },
      });
    }
  }

  // Trainee: selected caps
  const traineeCaps = [
    'view_courses','view_single_course','get_single_module','view_modules',
    'view_assessments',
    'view_own_profile','update_own_profile'
  ];
  for (const name of traineeCaps) {
    const cap = allCaps.find(c => c.name === name);
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
    where: { email: 'admin@example.com' },
    update: {},
    create: { 
      email: 'admin@example.com', 
      password: 'password', 
      roleId: adminRole.id,
      fullName: 'Admin User',
      phoneNumber: '+91-9999999999',
      designation: 'System Administrator'
    }
  });
  const trainerUser = await prisma.user.upsert({
    where: { email: 'trainer@example.com' },
    update: {},
    create: { 
      email: 'trainer@example.com', 
      password: 'password', 
      roleId: trainerRole.id,
      fullName: 'Trainer User',
      phoneNumber: '+91-8888888888',
      designation: 'Senior Trainer'
    }
  });
  const traineeUser = await prisma.user.upsert({
    where: { email: 'trainee@example.com' },
    update: {},
    create: { 
      email: 'trainee@example.com', 
      password: 'password', 
      roleId: traineeRole.id,
      fullName: 'Trainee User',
      phoneNumber: '+91-7777777777',
      designation: 'Student'
    }
  });

  // 5. Create sample course (if not exists) and enroll trainee
  let course = await prisma.course.findFirst({ where: { title: 'Sample Course' } });
  if (!course) {
    course = await prisma.course.create({
      data: {
        title: 'Sample Course',
        description: 'An example course',
        createdById: trainerUser.id
      }
    });
  }
  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: traineeUser.id, courseId: course.id } },
    update: {},
    create: { userId: traineeUser.id, courseId: course.id, enrolledById: trainerUser.id }
  });

  // 6. Create sample assessment (if not exists)
  let assessment = await prisma.assessment.findFirst({
    where: { title: 'Sample Quiz', courseId: course.id }
  });
  if (!assessment) {
    assessment = await prisma.assessment.create({
      data: {
        title: 'Sample Quiz',
        description: 'Simple quiz',
        courseId: course.id,
        timeLimit: 10,
        totalMarks: 10,
        passingMarks: 5,
        attempts: 1,
        randomizeQuestions: false,
        showResults: true,
        allowReview: true
      }
    });
  }

  // 7. Create questions (if not exists)
  const q1 = await prisma.question.findFirst({
    where: { assessmentId: assessment.id, questionText: 'What is 2+2?' }
  });
  if (!q1) {
    await prisma.question.create({
      data: {
        assessmentId: assessment.id,
        questionText: 'What is 2+2?',
        questionType: 'MULTIPLE_CHOICE',
        marks: 5,
        order: 1,
        options: {
          create: [
            { optionText: '3', isCorrect: false, order: 1 },
            { optionText: '4', isCorrect: true, order: 2 },
            { optionText: '5', isCorrect: false, order: 3 }
          ]
        }
      }
    });
  }

  const q2 = await prisma.question.findFirst({
    where: { assessmentId: assessment.id, questionText: 'True or False: The sky is green.' }
  });
  if (!q2) {
    await prisma.question.create({
      data: {
        assessmentId: assessment.id,
        questionText: 'True or False: The sky is green.',
        questionType: 'TRUE_FALSE',
        marks: 5,
        order: 2,
        options: {
          create: [
            { optionText: 'True', isCorrect: false, order: 1 },
            { optionText: 'False', isCorrect: true, order: 2 }
          ]
        }
      }
    });
  }

  console.log('✅ Seeding complete');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
