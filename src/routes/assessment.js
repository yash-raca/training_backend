const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authenticateToken = require('../middleware/auth');

const prisma = new PrismaClient();

// ============================================
// STUDENT ENDPOINTS
// ============================================

/**
 * GET /api/assessments/student/my-assessments
 * Get all assessments from enrolled courses
 */
router.get('/student/my-assessments', authenticateToken, authorize('view_all_enrolled_assessment'), async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get all courses user is enrolled in
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: userId },
      include: {
        course: {
          include: {
            assessments: {
              where: { isActive: true },
              include: {
                submissions: {
                  where: { userId: userId },
                  orderBy: { createdAt: 'desc' }
                },
                _count: {
                  select: { questions: true }
                }
              }
            }
          }
        }
      }
    });

    // Format response with assessment status
    const myAssessments = enrollments.flatMap(enrollment => 
      enrollment.course.assessments.map(assessment => {
        const submissions = assessment.submissions;
        const latestSubmission = submissions[0];
        const attemptsUsed = submissions.length;
        const attemptsRemaining = assessment.attempts - attemptsUsed;

        let status = 'NOT_STARTED';
        if (latestSubmission) {
          if (latestSubmission.status === 'IN_PROGRESS') {
            status = 'IN_PROGRESS';
          } else if (latestSubmission.status === 'COMPLETED') {
            status = latestSubmission.isPassed ? 'PASSED' : 'FAILED';
          }
        }

        // Check if assessment is available
        const now = new Date();
        const isAvailable = (!assessment.startDate || now >= assessment.startDate) &&
                           (!assessment.endDate || now <= assessment.endDate);

        return {
          assessmentId: assessment.id,
          title: assessment.title,
          description: assessment.description,
          courseName: enrollment.course.title,
          courseId: enrollment.course.id,
          timeLimit: assessment.timeLimit,
          totalMarks: assessment.totalMarks,
          passingMarks: assessment.passingMarks,
          totalQuestions: assessment._count.questions,
          attempts: assessment.attempts,
          attemptsUsed: attemptsUsed,
          attemptsRemaining: attemptsRemaining,
          status: status,
          isAvailable: isAvailable,
          startDate: assessment.startDate,
          endDate: assessment.endDate,
          latestScore: latestSubmission ? {
            percentage: latestSubmission.percentage,
            obtainedMarks: latestSubmission.obtainedMarks,
            isPassed: latestSubmission.isPassed,
            submittedAt: latestSubmission.endTime
          } : null,
          canStart: isAvailable && attemptsRemaining > 0 && status !== 'IN_PROGRESS',
          canResume: latestSubmission?.status === 'IN_PROGRESS',
          canRetake: isAvailable && attemptsRemaining > 0 && latestSubmission?.status === 'COMPLETED'
        };
      })
    );

    // Sort by status priority
    myAssessments.sort((a, b) => {
      const statusOrder = { 'IN_PROGRESS': 0, 'NOT_STARTED': 1, 'FAILED': 2, 'PASSED': 3 };
      return statusOrder[a.status] - statusOrder[b.status];
    });

    res.json({
      success: true,
      count: myAssessments.length,
      data: myAssessments
    });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assessments',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/student/assessments/:id/details
 * Get assessment details before starting
 */
router.get('/student/assessments/:id/details', authenticateToken, authorize('view_enrolled_assessment_by_id'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const assessment = await prisma.assessment.findFirst({
      where: {
        id: parseInt(id),
        isActive: true
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        _count: {
          select: {
            questions: true
          }
        },
        submissions: {
          where: {
            userId: userId
          }
        }
      }
    });

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    // Check enrollment
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: userId,
        courseId: assessment.courseId
      }
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    const attemptsUsed = assessment.submissions.length;
    const attemptsRemaining = assessment.attempts - attemptsUsed;

    res.json({
      success: true,
      data: {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        course: assessment.course,
        timeLimit: assessment.timeLimit,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        totalQuestions: assessment._count.questions,
        attempts: assessment.attempts,
        attemptsUsed: attemptsUsed,
        attemptsRemaining: attemptsRemaining,
        startDate: assessment.startDate,
        endDate: assessment.endDate
      }
    });
  } catch (error) {
    console.error('Error fetching assessment details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assessment details',
      error: error.message
    });
  }
});

/**
 * POST /api/assessments/student/assessments/:id/start
 * Start taking an assessment
 */
router.post('/student/assessments/:id/start', authenticateToken, authorize('start_taking_assessment'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    // Check if assessment exists and is active
    const assessment = await prisma.assessment.findFirst({
      where: {
        id: parseInt(id),
        isActive: true
      },
      include: {
        questions: {
          where: { isActive: true },
          include: {
            options: true
          },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found or inactive'
      });
    }

    // Check enrollment
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: userId,
        courseId: assessment.courseId
      }
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    // Check time constraints
    const now = new Date();
    if (assessment.startDate && now < assessment.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Assessment has not started yet'
      });
    }

    if (assessment.endDate && now > assessment.endDate) {
      return res.status(400).json({
        success: false,
        message: 'Assessment has ended'
      });
    }

    // Check existing attempts
    const existingAttempts = await prisma.assessmentSubmission.count({
      where: {
        assessmentId: parseInt(id),
        userId: userId
      }
    });

    if (existingAttempts >= assessment.attempts) {
      return res.status(400).json({
        success: false,
        message: 'Maximum attempts exceeded'
      });
    }

    // Check if there's an in-progress submission
    const inProgressSubmission = await prisma.assessmentSubmission.findFirst({
      where: {
        assessmentId: parseInt(id),
        userId: userId,
        status: 'IN_PROGRESS'
      }
    });

    let submission;
    if (inProgressSubmission) {
      submission = inProgressSubmission;
    } else {
      // Create new submission
      submission = await prisma.assessmentSubmission.create({
        data: {
          assessmentId: parseInt(id),
          userId: userId,
          totalMarks: assessment.totalMarks,
          attemptNumber: existingAttempts + 1,
          status: 'IN_PROGRESS'
        }
      });
    }

    // Randomize questions if enabled
    let questions = assessment.questions;
    if (assessment.randomizeQuestions && !inProgressSubmission) {
      questions = [...questions].sort(() => Math.random() - 0.5);
    }

    // Format questions (hide correct answers)
    const formattedQuestions = questions.map(q => ({
      id: q.id,
      questionText: q.questionText,
      questionType: q.questionType,
      marks: q.marks,
      imageUrl: q.imageUrl,
      options: q.options
        .sort((a, b) => a.order - b.order)
        .map(opt => ({
          id: opt.id,
          optionText: opt.optionText
        }))
    }));

    res.json({
      success: true,
      data: {
        submissionId: submission.id,
        assessment: {
          id: assessment.id,
          title: assessment.title,
          description: assessment.description,
          timeLimit: assessment.timeLimit,
          totalMarks: assessment.totalMarks,
          startTime: submission.startTime
        },
        questions: formattedQuestions
      }
    });
  } catch (error) {
    console.error('Error starting assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error starting assessment',
      error: error.message
    });
  }
});

/**
 * POST /api/assessments/student/save-answer
 * Save/update answer for a question
 */
router.post('/student/save-answer', authenticateToken, authorize('save_answer'), async (req, res) => {
  try {
    const { submissionId, questionId, selectedOptionId, textAnswer, timeSpent } = req.body;
    const userId = req.user.userId;

    // Verify submission belongs to user and is in progress
    const submission = await prisma.assessmentSubmission.findFirst({
      where: {
        id: submissionId,
        userId: userId,
        status: 'IN_PROGRESS'
      }
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Invalid submission or assessment already completed'
      });
    }

    // Get question details
    const question = await prisma.question.findFirst({
      where: { id: questionId },
      include: {
        options: true
      }
    });

    if (!question) {
      return res.status(404).json({
        success: false,
        message: 'Question not found'
      });
    }

    // Determine if answer is correct and calculate marks
    let isCorrect = false;
    let marksObtained = 0;

    if (question.questionType === 'MULTIPLE_CHOICE' || question.questionType === 'TRUE_FALSE') {
      const selectedOption = question.options.find(opt => opt.id === selectedOptionId);
      if (selectedOption && selectedOption.isCorrect) {
        isCorrect = true;
        marksObtained = question.marks;
      }
    }

    // Save or update answer
    await prisma.submissionAnswer.upsert({
      where: {
        submissionId_questionId: {
          submissionId: submissionId,
          questionId: questionId
        }
      },
      update: {
        selectedOptionId,
        textAnswer,
        isCorrect,
        marksObtained,
        timeSpent
      },
      create: {
        submissionId,
        questionId,
        selectedOptionId,
        textAnswer,
        isCorrect,
        marksObtained,
        timeSpent
      }
    });

    res.json({
      success: true,
      message: 'Answer saved successfully'
    });
  } catch (error) {
    console.error('Error saving answer:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving answer',
      error: error.message
    });
  }
});

/**
 * POST /api/assessments/student/assessments/:id/submit
 * Final submission of assessment
 */
router.post('/student/assessments/:id/submit', authenticateToken, authorize('submit_assessment'), async (req, res) => {
  try {
    const { id } = req.params;
    const { submissionId } = req.body;
    const userId = req.user.userId;

    // Get submission with answers
    const submission = await prisma.assessmentSubmission.findFirst({
      where: {
        id: submissionId,
        userId: userId,
        assessmentId: parseInt(id),
        status: 'IN_PROGRESS'
      },
      include: {
        answers: true,
        assessment: true
      }
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Calculate total marks
    const obtainedMarks = submission.answers.reduce((total, answer) => total + answer.marksObtained, 0);
    const percentage = (obtainedMarks / submission.totalMarks) * 100;
    const isPassed = obtainedMarks >= submission.assessment.passingMarks;

    // Calculate time spent
    const timeSpent = Math.floor((new Date() - submission.startTime) / 1000);

    // Update submission
    const updatedSubmission = await prisma.assessmentSubmission.update({
      where: { id: submissionId },
      data: {
        endTime: new Date(),
        status: 'COMPLETED',
        obtainedMarks,
        percentage,
        isPassed,
        timeSpent
      },
      include: {
        assessment: {
          select: {
            title: true,
            showResults: true,
            allowReview: true
          }
        },
        answers: {
          include: {
            question: {
              select: {
                questionText: true,
                explanation: true,
                marks: true
              }
            },
            selectedOption: {
              select: {
                optionText: true,
                isCorrect: true
              }
            }
          }
        }
      }
    });

    // Prepare response based on assessment settings
    let responseData = {
      submissionId: updatedSubmission.id,
      obtainedMarks,
      totalMarks: submission.totalMarks,
      percentage: parseFloat(percentage.toFixed(2)),
      isPassed,
      timeSpent
    };

    if (submission.assessment.showResults) {
      responseData.results = updatedSubmission.answers.map(answer => ({
        questionText: answer.question.questionText,
        selectedAnswer: answer.selectedOption?.optionText || answer.textAnswer,
        isCorrect: answer.isCorrect,
        marksObtained: answer.marksObtained,
        totalMarks: answer.question.marks,
        explanation: submission.assessment.allowReview ? answer.question.explanation : null
      }));
    }

    res.json({
      success: true,
      message: 'Assessment submitted successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error submitting assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting assessment',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/student/my-results
 * Get all results for the logged-in student
 */
router.get('/student/my-results', authenticateToken, authorize('get_user_result'), async (req, res) => {
  try {
    const userId = req.user.userId;

    const submissions = await prisma.assessmentSubmission.findMany({
      where: {
        userId: userId,
        status: 'COMPLETED'
      },
      include: {
        assessment: {
          select: {
            title: true,
            totalMarks: true,
            passingMarks: true,
            course: {
              select: {
                title: true
              }
            }
          }
        }
      },
      orderBy: {
        endTime: 'desc'
      }
    });

    const results = submissions.map(sub => ({
      submissionId: sub.id,
      assessmentId: sub.assessmentId,
      assessmentTitle: sub.assessment.title,
      courseName: sub.assessment.course.title,
      attemptNumber: sub.attemptNumber,
      obtainedMarks: sub.obtainedMarks,
      totalMarks: sub.totalMarks,
      percentage: sub.percentage,
      isPassed: sub.isPassed,
      timeSpent: sub.timeSpent,
      submittedAt: sub.endTime
    }));

    res.json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error('Error fetching results:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching results',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/student/submissions/:id/review
 * Review a specific submission with detailed answers
 */
router.get('/student/submissions/:id/review', authenticateToken, authorize('review_submission'), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const submission = await prisma.assessmentSubmission.findFirst({
      where: {
        id: parseInt(id),
        userId: userId,
        status: 'COMPLETED'
      },
      include: {
        assessment: {
          select: {
            title: true,
            allowReview: true,
            showResults: true,
            course: {
              select: {
                title: true
              }
            }
          }
        },
        answers: {
          include: {
            question: {
              include: {
                options: true
              }
            },
            selectedOption: true
          },
          orderBy: {
            question: {
              order: 'asc'
            }
          }
        }
      }
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    if (!submission.assessment.allowReview) {
      return res.status(403).json({
        success: false,
        message: 'Review is not allowed for this assessment'
      });
    }

    const detailedAnswers = submission.answers.map(answer => ({
      questionText: answer.question.questionText,
      questionType: answer.question.questionType,
      marks: answer.question.marks,
      marksObtained: answer.marksObtained,
      isCorrect: answer.isCorrect,
      yourAnswer: answer.selectedOption?.optionText || answer.textAnswer,
      correctAnswer: answer.question.options.find(opt => opt.isCorrect)?.optionText || 'N/A',
      explanation: answer.question.explanation,
      allOptions: answer.question.options.map(opt => ({
        text: opt.optionText,
        isCorrect: opt.isCorrect,
        wasSelected: opt.id === answer.selectedOptionId
      }))
    }));

    res.json({
      success: true,
      data: {
        submission: {
          submissionId: submission.id,
          assessmentTitle: submission.assessment.title,
          courseName: submission.assessment.course.title,
          attemptNumber: submission.attemptNumber,
          obtainedMarks: submission.obtainedMarks,
          totalMarks: submission.totalMarks,
          percentage: submission.percentage,
          isPassed: submission.isPassed,
          timeSpent: submission.timeSpent,
          submittedAt: submission.endTime
        },
        answers: detailedAnswers
      }
    });
  } catch (error) {
    console.error('Error fetching submission review:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching submission review',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/student/courses/:courseId/progress
 * Get assessment progress for a specific course
 */
router.get('/student/courses/:courseId/progress', authenticateToken, authorize('view_assessment_progress'), async (req, res) => {
  try {
    const { courseId } = req.params;
    const userId = req.user.userId;

    // Check enrollment
    const enrollment = await prisma.enrollment.findFirst({
      where: {
        userId: userId,
        courseId: parseInt(courseId)
      }
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You are not enrolled in this course'
      });
    }

    const assessments = await prisma.assessment.findMany({
      where: {
        courseId: parseInt(courseId),
        isActive: true
      },
      include: {
        submissions: {
          where: {
            userId: userId
          },
          orderBy: {
            attemptNumber: 'desc'
          }
        }
      }
    });

    const progress = assessments.map(assessment => {
      const completedSubmissions = assessment.submissions.filter(s => s.status === 'COMPLETED');
      const latestSubmission = assessment.submissions[0];

      return {
        assessmentId: assessment.id,
        title: assessment.title,
        totalMarks: assessment.totalMarks,
        passingMarks: assessment.passingMarks,
        maxAttempts: assessment.attempts,
        status: latestSubmission 
          ? (latestSubmission.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 
             (latestSubmission.isPassed ? 'PASSED' : 'FAILED'))
          : 'PENDING',
        latestAttempt: latestSubmission || null,
        attemptsUsed: assessment.submissions.length,
        attemptsRemaining: assessment.attempts - assessment.submissions.length,
        bestScore: completedSubmissions.length > 0 
          ? Math.max(...completedSubmissions.map(s => s.percentage))
          : null
      };
    });

    res.json({
      success: true,
      data: progress
    });
  } catch (error) {
    console.error('Error fetching course progress:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course progress',
      error: error.message
    });
  }
});

module.exports = router;
