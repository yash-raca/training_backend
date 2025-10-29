const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authenticateToken = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const prisma = new PrismaClient();

// ============================================
// ADMIN/INSTRUCTOR ENDPOINTS
// ============================================

/**
 * POST /api/assessments/admin/assessments
 * Create new assessment with questions
 */
router.post('/admin/assessments', authenticateToken, authorize('create_assessments'), async (req, res) => {
  try {
    const {
      title,
      description,
      courseId,
      timeLimit,
      totalMarks,
      passingMarks,
      attempts,
      randomizeQuestions,
      showResults,
      allowReview,
      startDate,
      endDate,
      questions
    } = req.body;

    // Validation
    if (!title || !courseId) {
      return res.status(400).json({
        success: false,
        message: 'Title and courseId are required'
      });
    }

    const assessment = await prisma.assessment.create({
      data: {
        title,
        description,
        courseId: parseInt(courseId),
        timeLimit: timeLimit || null,
        totalMarks: totalMarks || 100,
        passingMarks: passingMarks || 40,
        attempts: attempts || 1,
        randomizeQuestions: randomizeQuestions || false,
        showResults: showResults !== undefined ? showResults : true,
        allowReview: allowReview || false,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        questions: questions && questions.length > 0 ? {
          create: questions.map((q, index) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            marks: q.marks || 1,
            order: q.order || index + 1,
            explanation: q.explanation || null,
            imageUrl: q.imageUrl || null,
            options: q.options && q.options.length > 0 ? {
              create: q.options.map((opt, optIndex) => ({
                optionText: opt.optionText,
                isCorrect: opt.isCorrect || false,
                order: opt.order || optIndex + 1
              }))
            } : undefined
          }))
        } : undefined
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        questions: {
          include: {
            options: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Assessment created successfully',
      data: assessment
    });
  } catch (error) {
    console.error('Error creating assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating assessment',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/admin/assessments
 * Get all assessments (with filters)
 */
router.get('/admin/assessments', authenticateToken, authorize('view_assessments'), async (req, res) => {
  try {
    const { courseId, status, search } = req.query;

    const where = {};
    if (courseId) where.courseId = parseInt(courseId);
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const assessments = await prisma.assessment.findMany({
      where,
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        _count: {
          select: {
            questions: true,
            submissions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate statistics for each assessment
    const assessmentsWithStats = await Promise.all(
      assessments.map(async (assessment) => {
        const completedSubmissions = await prisma.assessmentSubmission.count({
          where: {
            assessmentId: assessment.id,
            status: 'COMPLETED'
          }
        });

        const passedSubmissions = await prisma.assessmentSubmission.count({
          where: {
            assessmentId: assessment.id,
            status: 'COMPLETED',
            isPassed: true
          }
        });

        const avgScore = await prisma.assessmentSubmission.aggregate({
          where: {
            assessmentId: assessment.id,
            status: 'COMPLETED'
          },
          _avg: {
            percentage: true
          }
        });

        return {
          ...assessment,
          statistics: {
            totalQuestions: assessment._count.questions,
            totalSubmissions: assessment._count.submissions,
            completedSubmissions: completedSubmissions,
            passedSubmissions: passedSubmissions,
            passRate: completedSubmissions > 0 
              ? parseFloat(((passedSubmissions / completedSubmissions) * 100).toFixed(2))
              : 0,
            averageScore: parseFloat(avgScore._avg.percentage?.toFixed(2)) || 0
          }
        };
      })
    );

    res.json({
      success: true,
      count: assessmentsWithStats.length,
      data: assessmentsWithStats
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
 * GET /api/assessments/admin/assessments/:id
 * Get single assessment details
 */
router.get('/admin/assessments/:id', authenticateToken, authorize('view_assessment_by_id'), async (req, res) => {
  try {
    const { id } = req.params;

    const assessment = await prisma.assessment.findUnique({
      where: { id: parseInt(id) },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        },
        questions: {
          include: {
            options: {
              orderBy: {
                order: 'asc'
              }
            }
          },
          orderBy: {
            order: 'asc'
          }
        },
        _count: {
          select: {
            submissions: true
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

    res.json({
      success: true,
      data: assessment
    });
  } catch (error) {
    console.error('Error fetching assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assessment',
      error: error.message
    });
  }
});

/**
 * PUT /api/assessments/admin/assessments/:id
 * Update assessment
 */
router.put('/admin/assessments/:id', authenticateToken, authorize('update_assessments'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      courseId,
      timeLimit,
      totalMarks,
      passingMarks,
      attempts,
      randomizeQuestions,
      showResults,
      allowReview,
      startDate,
      endDate,
      isActive
    } = req.body;

    const assessment = await prisma.assessment.update({
      where: { id: parseInt(id) },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(courseId && { courseId: parseInt(courseId) }),
        ...(timeLimit !== undefined && { timeLimit }),
        ...(totalMarks && { totalMarks }),
        ...(passingMarks !== undefined && { passingMarks }),
        ...(attempts && { attempts }),
        ...(randomizeQuestions !== undefined && { randomizeQuestions }),
        ...(showResults !== undefined && { showResults }),
        ...(allowReview !== undefined && { allowReview }),
        ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
        ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
        ...(isActive !== undefined && { isActive })
      },
      include: {
        course: {
          select: {
            id: true,
            title: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Assessment updated successfully',
      data: assessment
    });
  } catch (error) {
    console.error('Error updating assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating assessment',
      error: error.message
    });
  }
});

/**
 * DELETE /api/assessments/admin/assessments/:id
 * Delete assessment
 */
router.delete('/admin/assessments/:id', authenticateToken, authorize('delete_assessments'), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.assessment.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Assessment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting assessment',
      error: error.message
    });
  }
});

/**
 * PATCH /api/assessments/admin/assessments/:id/toggle-status
 * Toggle assessment active status
 */
router.patch('/admin/assessments/:id/toggle-status', authenticateToken, authorize('toggle_assessment_status'), async (req, res) => {
  try {
    const { id } = req.params;

    const assessment = await prisma.assessment.findUnique({
      where: { id: parseInt(id) }
    });

    if (!assessment) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    const updated = await prisma.assessment.update({
      where: { id: parseInt(id) },
      data: {
        isActive: !assessment.isActive
      }
    });

    res.json({
      success: true,
      message: `Assessment ${updated.isActive ? 'activated' : 'deactivated'} successfully`,
      data: updated
    });
  } catch (error) {
    console.error('Error toggling assessment status:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling assessment status',
      error: error.message
    });
  }
});

/**
 * POST /api/assessments/admin/assessments/:id/duplicate
 * Duplicate an assessment
 */
router.post('/admin/assessments/:id/duplicate', authenticateToken, authorize('duplicate_assessment'), async (req, res) => {
  try {
    const { id } = req.params;

    const original = await prisma.assessment.findUnique({
      where: { id: parseInt(id) },
      include: {
        questions: {
          include: {
            options: true
          }
        }
      }
    });

    if (!original) {
      return res.status(404).json({
        success: false,
        message: 'Assessment not found'
      });
    }

    const duplicate = await prisma.assessment.create({
      data: {
        title: `${original.title} (Copy)`,
        description: original.description,
        courseId: original.courseId,
        timeLimit: original.timeLimit,
        totalMarks: original.totalMarks,
        passingMarks: original.passingMarks,
        attempts: original.attempts,
        randomizeQuestions: original.randomizeQuestions,
        showResults: original.showResults,
        allowReview: original.allowReview,
        isActive: false,
        questions: {
          create: original.questions.map(q => ({
            questionText: q.questionText,
            questionType: q.questionType,
            marks: q.marks,
            order: q.order,
            explanation: q.explanation,
            imageUrl: q.imageUrl,
            options: {
              create: q.options.map(opt => ({
                optionText: opt.optionText,
                isCorrect: opt.isCorrect,
                order: opt.order
              }))
            }
          }))
        }
      },
      include: {
        questions: {
          include: {
            options: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Assessment duplicated successfully',
      data: duplicate
    });
  } catch (error) {
    console.error('Error duplicating assessment:', error);
    res.status(500).json({
      success: false,
      message: 'Error duplicating assessment',
      error: error.message
    });
  }
});

// ============================================
// QUESTION MANAGEMENT
// ============================================

/**
 * POST /api/assessments/admin/assessments/:id/questions
 * Add question to assessment
 */
router.post('/admin/assessments/:id/questions', authenticateToken, authorize('add_question_to_assessment'), async (req, res) => {
  try {
    const { id } = req.params;
    const { questionText, questionType, marks, explanation, imageUrl, options } = req.body;

    // Get current question count for order
    const questionCount = await prisma.question.count({
      where: { assessmentId: parseInt(id) }
    });

    const question = await prisma.question.create({
      data: {
        assessmentId: parseInt(id),
        questionText,
        questionType,
        marks: marks || 1,
        order: questionCount + 1,
        explanation: explanation || null,
        imageUrl: imageUrl || null,
        options: options && options.length > 0 ? {
          create: options.map((opt, index) => ({
            optionText: opt.optionText,
            isCorrect: opt.isCorrect || false,
            order: index + 1
          }))
        } : undefined
      },
      include: {
        options: true
      }
    });

    res.status(201).json({
      success: true,
      message: 'Question added successfully',
      data: question
    });
  } catch (error) {
    console.error('Error adding question:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding question',
      error: error.message
    });
  }
});

/**
 * PUT /api/assessments/admin/questions/:id
 * Update question
 */
router.put('/admin/questions/:id', authenticateToken, authorize('update_question'), async (req, res) => {
  try {
    const { id } = req.params;
    const { questionText, questionType, marks, explanation, imageUrl, isActive, options } = req.body;

    // Update question
    const question = await prisma.question.update({
      where: { id: parseInt(id) },
      data: {
        ...(questionText && { questionText }),
        ...(questionType && { questionType }),
        ...(marks !== undefined && { marks }),
        ...(explanation !== undefined && { explanation }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(isActive !== undefined && { isActive })
      }
    });

    // Update options if provided
    if (options && options.length > 0) {
      // Delete existing options
      await prisma.questionOption.deleteMany({
        where: { questionId: parseInt(id) }
      });

      // Create new options
      await prisma.questionOption.createMany({
        data: options.map((opt, index) => ({
          questionId: parseInt(id),
          optionText: opt.optionText,
          isCorrect: opt.isCorrect || false,
          order: index + 1
        }))
      });
    }

    // Fetch updated question with options
    const updatedQuestion = await prisma.question.findUnique({
      where: { id: parseInt(id) },
      include: {
        options: {
          orderBy: { order: 'asc' }
        }
      }
    });

    res.json({
      success: true,
      message: 'Question updated successfully',
      data: updatedQuestion
    });
  } catch (error) {
    console.error('Error updating question:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating question',
      error: error.message
    });
  }
});

/**
 * DELETE /api/assessments/admin/questions/:id
 * Delete question
 */
router.delete('/admin/questions/:id', authenticateToken, authorize('delete_question'), async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.question.delete({
      where: { id: parseInt(id) }
    });

    res.json({
      success: true,
      message: 'Question deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting question',
      error: error.message
    });
  }
});

// ============================================
// ANALYTICS & REPORTS
// ============================================

/**
 * GET /api/assessments/admin/assessments/:id/analytics
 * Get detailed analytics for an assessment
 */
router.get('/admin/assessments/:id/analytics', authenticateToken, authorize('view_assessment_analytics'), async (req, res) => {
  try {
    const { id } = req.params;

    const assessment = await prisma.assessment.findUnique({
      where: { id: parseInt(id) },
      include: {
        questions: {
          include: {
            answers: {
              where: {
                submission: {
                  status: 'COMPLETED'
                }
              }
            }
          }
        },
        submissions: {
          where: {
            status: 'COMPLETED'
          },
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            }
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

    // Overall statistics
    const totalStudents = new Set(assessment.submissions.map(s => s.userId)).size;
    const totalAttempts = assessment.submissions.length;
    const passedCount = assessment.submissions.filter(s => s.isPassed).length;
    const avgScore = totalAttempts > 0
      ? assessment.submissions.reduce((sum, s) => sum + s.percentage, 0) / totalAttempts
      : 0;

    // Question-wise analysis
    const questionAnalytics = assessment.questions.map(question => {
      const totalAnswers = question.answers.length;
      const correctAnswers = question.answers.filter(a => a.isCorrect).length;
      const accuracy = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

      return {
        questionId: question.id,
        questionText: question.questionText.substring(0, 100) + '...',
        totalAttempts: totalAnswers,
        correctAttempts: correctAnswers,
        accuracy: parseFloat(accuracy.toFixed(2)),
        difficulty: accuracy > 70 ? 'Easy' : accuracy > 40 ? 'Medium' : 'Hard'
      };
    });

    // Score distribution
    const scoreRanges = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0
    };

    assessment.submissions.forEach(sub => {
      const percentage = sub.percentage;
      if (percentage <= 20) scoreRanges['0-20']++;
      else if (percentage <= 40) scoreRanges['21-40']++;
      else if (percentage <= 60) scoreRanges['41-60']++;
      else if (percentage <= 80) scoreRanges['61-80']++;
      else scoreRanges['81-100']++;
    });

    // Student-wise performance
    const studentPerformance = assessment.submissions.map(sub => ({
      studentId: sub.user.id,
      studentEmail: sub.user.email,
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
      data: {
        overview: {
          totalStudents,
          totalAttempts,
          passedCount,
          passRate: totalAttempts > 0 ? parseFloat(((passedCount / totalAttempts) * 100).toFixed(2)) : 0,
          averageScore: parseFloat(avgScore.toFixed(2)),
          scoreDistribution: scoreRanges
        },
        questionAnalytics,
        studentPerformance
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/admin/assessments/:id/submissions
 * Get all submissions for an assessment
 */
router.get('/admin/assessments/:id/submissions', authenticateToken, authorize('view_assessments_submissions'), async (req, res) => {
  try {
    const { id } = req.params;

    const submissions = await prisma.assessmentSubmission.findMany({
      where: {
        assessmentId: parseInt(id)
      },
      include: {
        user: {
          select: {
            id: true,
            email: true
          }
        },
        answers: {
          include: {
            question: {
              select: {
                questionText: true,
                marks: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      count: submissions.length,
      data: submissions
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching submissions',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/admin/courses/:courseId/analytics
 * Get course-level assessment analytics
 */
router.get('/admin/courses/:courseId/analytics', authenticateToken, authorize('view_assessment_analytics_courselevel'), async (req, res) => {
  try {
    const { courseId } = req.params;

    const assessments = await prisma.assessment.findMany({
      where: {
        courseId: parseInt(courseId)
      },
      include: {
        submissions: {
          where: {
            status: 'COMPLETED'
          }
        },
        _count: {
          select: {
            questions: true,
            submissions: true
          }
        }
      }
    });

    const analytics = assessments.map(assessment => {
      const completedSubmissions = assessment.submissions;
      const totalStudents = new Set(assessment.submissions.map(s => s.userId)).size;
      const passedCount = completedSubmissions.filter(s => s.isPassed).length;
      const averageScore = completedSubmissions.length > 0
        ? completedSubmissions.reduce((sum, s) => sum + s.percentage, 0) / completedSubmissions.length
        : 0;

      return {
        assessmentId: assessment.id,
        title: assessment.title,
        totalQuestions: assessment._count.questions,
        totalStudents: totalStudents,
        completionRate: totalStudents > 0 
          ? parseFloat(((completedSubmissions.length / totalStudents) * 100).toFixed(2))
          : 0,
        passRate: completedSubmissions.length > 0
          ? parseFloat(((passedCount / completedSubmissions.length) * 100).toFixed(2))
          : 0,
        averageScore: parseFloat(averageScore.toFixed(2)),
        totalAttempts: assessment._count.submissions
      };
    });

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching course analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching course analytics',
      error: error.message
    });
  }
});

/**
 * GET /api/assessments/admin/pending-grading
 * Get pending manual grading queue
 */
router.get('/admin/pending-grading', authenticateToken, authorize('pending_grading'), async (req, res) => {
  try {
    const pendingSubmissions = await prisma.submissionAnswer.findMany({
      where: {
        question: {
          questionType: {
            in: ['SHORT_ANSWER', 'LONG_ANSWER']
          }
        },
        textAnswer: {
          not: null
        },
        marksObtained: 0
      },
      include: {
        submission: {
          include: {
            user: {
              select: {
                id: true,
                email: true
              }
            },
            assessment: {
              select: {
                id: true,
                title: true,
                course: {
                  select: {
                    title: true
                  }
                }
              }
            }
          }
        },
        question: {
          select: {
            id: true,
            questionText: true,
            marks: true,
            explanation: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const formattedQueue = pendingSubmissions.map(answer => ({
      answerId: answer.id,
      submissionId: answer.submission.id,
      assessmentTitle: answer.submission.assessment.title,
      courseName: answer.submission.assessment.course.title,
      studentEmail: answer.submission.user.email,
      questionText: answer.question.questionText,
      studentAnswer: answer.textAnswer,
      maxMarks: answer.question.marks,
      submittedAt: answer.createdAt
    }));

    res.json({
      success: true,
      count: formattedQueue.length,
      data: formattedQueue
    });
  } catch (error) {
    console.error('Error fetching pending grading:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching pending grading',
      error: error.message
    });
  }
});

/**
 * POST /api/assessments/admin/submissions/:id/grade
 * Grade a manual submission answer
 */
router.post('/admin/submissions/:id/grade', authenticateToken, authorize('give_grade_to_questions'), async (req, res) => {
  try {
    const { id } = req.params;
    const { marksObtained } = req.body;

    const answer = await prisma.submissionAnswer.findUnique({
      where: { id: parseInt(id) },
      include: {
        question: true,
        submission: {
          include: {
            assessment: true
          }
        }
      }
    });

    if (!answer) {
      return res.status(404).json({
        success: false,
        message: 'Answer not found'
      });
    }

    // Validate marks
    if (marksObtained < 0 || marksObtained > answer.question.marks) {
      return res.status(400).json({
        success: false,
        message: `Marks must be between 0 and ${answer.question.marks}`
      });
    }

    // Update answer with marks
    await prisma.submissionAnswer.update({
      where: { id: parseInt(id) },
      data: {
        marksObtained: marksObtained,
        isCorrect: marksObtained === answer.question.marks
      }
    });

    // Recalculate submission total
    const allAnswers = await prisma.submissionAnswer.findMany({
      where: {
        submissionId: answer.submissionId
      }
    });

    const totalObtained = allAnswers.reduce((sum, ans) => sum + ans.marksObtained, 0);
    const percentage = (totalObtained / answer.submission.totalMarks) * 100;
    const isPassed = totalObtained >= answer.submission.assessment.passingMarks;

    // Update submission
    await prisma.assessmentSubmission.update({
      where: { id: answer.submissionId },
      data: {
        obtainedMarks: totalObtained,
        percentage: percentage,
        isPassed: isPassed
      }
    });

    res.json({
      success: true,
      message: 'Answer graded successfully',
      data: {
        marksAwarded: marksObtained,
        maxMarks: answer.question.marks,
        newTotalScore: totalObtained,
        newPercentage: parseFloat(percentage.toFixed(2)),
        isPassed: isPassed
      }
    });
  } catch (error) {
    console.error('Error grading answer:', error);
    res.status(500).json({
      success: false,
      message: 'Error grading answer',
      error: error.message
    });
  }
});

module.exports = router;
