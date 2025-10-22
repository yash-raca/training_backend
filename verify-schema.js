const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifySchema() {
  try {
    console.log('🔍 Checking database schema...\n');

    // Check existing models
    const userCount = await prisma.user.count();
    const courseCount = await prisma.course.count();
    const enrollmentCount = await prisma.enrollment.count();
    
    console.log('✅ Existing models working:');
    console.log(`   Users: ${userCount}`);
    console.log(`   Courses: ${courseCount}`);
    console.log(`   Enrollments: ${enrollmentCount}\n`);

    // Check new assessment models
    const assessmentCount = await prisma.assessment.count();
    const questionCount = await prisma.question.count();
    const submissionCount = await prisma.assessmentSubmission.count();
    
    console.log('✅ New assessment models working:');
    console.log(`   Assessments: ${assessmentCount}`);
    console.log(`   Questions: ${questionCount}`);
    console.log(`   Submissions: ${submissionCount}\n`);

    // Test complex query with relations
    const enrollmentsWithCourses = await prisma.enrollment.findMany({
      include: {
        user: true,
        course: {
          include: {
            assessments: true
          }
        }
      },
      take: 1
    });

    console.log('✅ Complex relations working (Enrollment -> Course -> Assessment)');
    console.log('\n🎉 All schema checks passed!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifySchema();
