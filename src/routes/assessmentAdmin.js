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
 * MODIFIED: Removed showResults and allowReview fields
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

        const checkedSubmissions = await prisma.assessmentSubmission.count({
          where: {
            assessmentId: assessment.id,
            status: 'COMPLETED',
            isCheckedByTeacher: true
          }
        });

        const passedSubmissions = await prisma.assessmentSubmission.count({
          where: {
            assessmentId: assessment.id,
            status: 'COMPLETED',
            isPassed: true,
            isCheckedByTeacher: true
          }
        });

        const avgScore = await prisma.assessmentSubmission.aggregate({
          where: {
            assessmentId: assessment.id,
            status: 'COMPLETED',
            isCheckedByTeacher: true
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
            checkedSubmissions: checkedSubmissions,
            pendingReview: completedSubmissions - checkedSubmissions,
            passedSubmissions: passedSubmissions,
            passRate: checkedSubmissions > 0 
              ? parseFloat(((passedSubmissions / checkedSubmissions) * 100).toFixed(2))
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
 * MODIFIED: Removed showResults and allowReview fields
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
 * MODIFIED: Removed showResults and allowReview fields
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
// SUBMISSION GRADING & REVIEW (NEW/MODIFIED)
// ============================================

/**
 * GET /api/assessments/admin/pending-grading
 * Get pending manual grading queue
 * MODIFIED: Now groups by submission to show overall status
 */
router.get('/admin/pending-grading', authenticateToken, authorize('pending_grading'), async (req, res) => {
  try {
    // Get submissions with pending manual grading
    const pendingSubmissions = await prisma.assessmentSubmission.findMany({
      where: {
        status: 'COMPLETED',
        isCheckedByTeacher: false
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true
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
        },
        answers: {
          include: {
            question: {
              select: {
                id: true,
                questionText: true,
                questionType: true,
                marks: true
              }
            }
          }
        }
      },
      orderBy: {
        endTime: 'asc'
      }
    });

    const formattedQueue = pendingSubmissions.map(submission => {
      // Find manual grading questions
      const manualQuestions = submission.answers.filter(answer =>
        (answer.question.questionType === 'SHORT_ANSWER' || 
         answer.question.questionType === 'LONG_ANSWER') &&
        answer.textAnswer !== null
      );

      const ungradedQuestions = manualQuestions.filter(ans => ans.marksObtained === 0);

      return {
        submissionId: submission.id,
        assessmentId: submission.assessment.id,
        assessmentTitle: submission.assessment.title,
        courseName: submission.assessment.course.title,
        studentId: submission.user.id,
        studentName: submission.user.fullName || submission.user.email,
        studentEmail: submission.user.email,
        attemptNumber: submission.attemptNumber,
        submittedAt: submission.endTime,
        totalManualQuestions: manualQuestions.length,
        ungradedQuestions: ungradedQuestions.length,
        isFullyGraded: ungradedQuestions.length === 0,
        obtainedMarks: submission.obtainedMarks,
        totalMarks: submission.totalMarks,
        currentPercentage: submission.percentage
      };
    });

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
 * GET /api/assessments/admin/submissions/:id/details
 * Get detailed submission for grading (NEW ENDPOINT)
 */
router.get('/admin/submissions/:id/details', authenticateToken, authorize('view_submission_details'), async (req, res) => {
  try {
    const { id } = req.params;

    const submission = await prisma.assessmentSubmission.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            designation: true
          }
        },
        assessment: {
          select: {
            id: true,
            title: true,
            totalMarks: true,
            passingMarks: true,
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

    const formattedAnswers = submission.answers.map(answer => ({
      answerId: answer.id,
      questionId: answer.question.id,
      questionText: answer.question.questionText,
      questionType: answer.question.questionType,
      maxMarks: answer.question.marks,
      marksObtained: answer.marksObtained,
      isCorrect: answer.isCorrect,
      studentAnswer: answer.selectedOption?.optionText || answer.textAnswer,
      correctAnswer: answer.question.options?.find(opt => opt.isCorrect)?.optionText,
      allOptions: answer.question.options?.map(opt => ({
        id: opt.id,
        text: opt.optionText,
        isCorrect: opt.isCorrect,
        wasSelected: opt.id === answer.selectedOptionId
      })),
      explanation: answer.question.explanation,
      needsGrading: (answer.question.questionType === 'SHORT_ANSWER' || 
                     answer.question.questionType === 'LONG_ANSWER') && 
                    answer.marksObtained === 0 && 
                    answer.textAnswer !== null
    }));

    res.json({
      success: true,
      data: {
        submissionId: submission.id,
        student: submission.user,
        assessment: submission.assessment,
        attemptNumber: submission.attemptNumber,
        obtainedMarks: submission.obtainedMarks,
        totalMarks: submission.totalMarks,
        percentage: submission.percentage,
        isPassed: submission.isPassed,
        timeSpent: submission.timeSpent,
        submittedAt: submission.endTime,
        isCheckedByTeacher: submission.isCheckedByTeacher,
        checkedAt: submission.checkedAt,
        answers: formattedAnswers,
        gradingStatus: {
          total: formattedAnswers.length,
          graded: formattedAnswers.filter(a => !a.needsGrading).length,
          needsGrading: formattedAnswers.filter(a => a.needsGrading).length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching submission details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching submission details',
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
            assessment: true,
            answers: true
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

    // Recalculate submission total - IMPORTANT: Get all answers including the one we just updated
    const allAnswers = await prisma.submissionAnswer.findMany({
      where: {
        submissionId: answer.submissionId
      }
    });

    const totalObtained = allAnswers.reduce((sum, ans) => {
      // If this is the answer we just updated, use the new marksObtained
      if (ans.id === parseInt(id)) {
        return sum + marksObtained;
      }
      return sum + (ans.marksObtained || 0);
    }, 0);

    const totalMarks = answer.submission.assessment.totalMarks;
    const percentage = parseFloat(((totalObtained / totalMarks) * 100).toFixed(2));
    const isPassed = totalObtained >= answer.submission.assessment.passingMarks;

    // Update submission with calculated percentage
    const updatedSubmission = await prisma.assessmentSubmission.update({
      where: { id: answer.submissionId },
      data: {
        obtainedMarks: parseInt(totalObtained),
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
        newPercentage: percentage,
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


/**
 * POST /api/assessments/admin/submissions/:id/approve-review
 * Approve submission for student review after grading (NEW ENDPOINT)
 */
router.post('/admin/submissions/:id/approve-review', authenticateToken, authorize('approve_submission_review'), async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.userId;

    const submission = await prisma.assessmentSubmission.findUnique({
      where: { id: parseInt(id) },
      include: {
        assessment: true,
        answers: {
          include: {
            question: true
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

    if (submission.status !== 'COMPLETED') {
      return res.status(400).json({
        success: false,
        message: 'Only completed submissions can be approved'
      });
    }

    // Check if there are any ungraded short/long answer questions
    const ungradedAnswers = submission.answers.filter(answer => 
      (answer.question.questionType === 'SHORT_ANSWER' || 
       answer.question.questionType === 'LONG_ANSWER') &&
      answer.textAnswer !== null &&
      answer.marksObtained === 0
    );

    if (ungradedAnswers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot approve: ${ungradedAnswers.length} question(s) still need grading`
      });
    }

    // Approve the submission
    const updatedSubmission = await prisma.assessmentSubmission.update({
      where: { id: parseInt(id) },
      data: {
        isCheckedByTeacher: true,
        checkedBy: teacherId,
        checkedAt: new Date()
      },
      include: {
        user: {
          select: {
            email: true,
            fullName: true
          }
        }
      }
    });

    res.json({
      success: true,
      message: 'Submission approved for student review',
      data: {
        submissionId: updatedSubmission.id,
        studentName: updatedSubmission.user.fullName || updatedSubmission.user.email,
        approvedAt: updatedSubmission.checkedAt,
        obtainedMarks: updatedSubmission.obtainedMarks,
        totalMarks: updatedSubmission.totalMarks,
        percentage: updatedSubmission.percentage,
        isPassed: updatedSubmission.isPassed
      }
    });
  } catch (error) {
    console.error('Error approving submission:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving submission',
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
 * MODIFIED: Updated to include teacher review status
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
                  status: 'COMPLETED',
                  isCheckedByTeacher: true
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

    const checkedSubmissions = assessment.submissions.filter(s => s.isCheckedByTeacher);
    const totalStudents = new Set(checkedSubmissions.map(s => s.userId)).size;
    const totalAttempts = checkedSubmissions.length;
    const passedCount = checkedSubmissions.filter(s => s.isPassed).length;
    const avgScore = totalAttempts > 0
      ? checkedSubmissions.reduce((sum, s) => sum + s.percentage, 0) / totalAttempts
      : 0;

    // Question-wise analysis
    const questionAnalytics = assessment.questions.map(question => {
      const totalAnswers = question.answers.length;
      const correctAnswers = question.answers.filter(a => a.isCorrect).length;
      const accuracy = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

      return {
        questionId: question.id,
        questionText: question.questionText.substring(0, 100) + '...',
        questionType: question.questionType,
        totalAttempts: totalAnswers,
        correctAttempts: correctAnswers,
        accuracy: parseFloat(accuracy.toFixed(2)),
        difficulty: accuracy > 70 ? 'Easy' : accuracy > 40 ? 'Medium' : 'Hard'
      };
    });

    // Score distribution (only checked submissions)
    const scoreRanges = {
      '0-20': 0,
      '21-40': 0,
      '41-60': 0,
      '61-80': 0,
      '81-100': 0
    };

    checkedSubmissions.forEach(sub => {
      const percentage = sub.percentage;
      if (percentage <= 20) scoreRanges['0-20']++;
      else if (percentage <= 40) scoreRanges['21-40']++;
      else if (percentage <= 60) scoreRanges['41-60']++;
      else if (percentage <= 80) scoreRanges['61-80']++;
      else scoreRanges['81-100']++;
    });

    // Student-wise performance
    const studentPerformance = checkedSubmissions.map(sub => ({
      studentId: sub.user.id,
      studentEmail: sub.user.email,
      attemptNumber: sub.attemptNumber,
      obtainedMarks: sub.obtainedMarks,
      totalMarks: sub.totalMarks,
      percentage: sub.percentage,
      isPassed: sub.isPassed,
      timeSpent: sub.timeSpent,
      submittedAt: sub.endTime,
      checkedAt: sub.checkedAt
    }));

    res.json({
      success: true,
      data: {
        overview: {
          totalSubmissions: assessment.submissions.length,
          checkedSubmissions: checkedSubmissions.length,
          pendingReview: assessment.submissions.length - checkedSubmissions.length,
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
 * MODIFIED: Added teacher review status
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
            email: true,
            fullName: true
          }
        },
        checkedByTeacher: {
          select: {
            id: true,
            fullName: true
          }
        },
        answers: {
          include: {
            question: {
              select: {
                questionText: true,
                marks: true,
                questionType: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const formattedSubmissions = submissions.map(sub => ({
      submissionId: sub.id,
      studentId: sub.user.id,
      studentName: sub.user.fullName || sub.user.email,
      studentEmail: sub.user.email,
      attemptNumber: sub.attemptNumber,
      status: sub.status,
      obtainedMarks: sub.isCheckedByTeacher ? sub.obtainedMarks : null,
      totalMarks: sub.totalMarks,
      percentage: sub.isCheckedByTeacher ? sub.percentage : null,
      isPassed: sub.isCheckedByTeacher ? sub.isPassed : null,
      timeSpent: sub.timeSpent,
      submittedAt: sub.endTime,
      isCheckedByTeacher: sub.isCheckedByTeacher,
      checkedBy: sub.checkedByTeacher?.fullName || null,
      checkedAt: sub.checkedAt,
      reviewStatus: sub.isCheckedByTeacher ? 'APPROVED_FOR_REVIEW' : 'PENDING_REVIEW'
    }));

    res.json({
      success: true,
      count: formattedSubmissions.length,
      data: formattedSubmissions
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
      const checkedSubmissions = completedSubmissions.filter(s => s.isCheckedByTeacher);
      const totalStudents = new Set(completedSubmissions.map(s => s.userId)).size;
      const passedCount = checkedSubmissions.filter(s => s.isPassed).length;
      const averageScore = checkedSubmissions.length > 0
        ? checkedSubmissions.reduce((sum, s) => sum + s.percentage, 0) / checkedSubmissions.length
        : 0;

      return {
        assessmentId: assessment.id,
        title: assessment.title,
        totalQuestions: assessment._count.questions,
        totalStudents: totalStudents,
        totalSubmissions: assessment._count.submissions,
        checkedSubmissions: checkedSubmissions.length,
        pendingReview: completedSubmissions.length - checkedSubmissions.length,
        completionRate: totalStudents > 0 
          ? parseFloat(((completedSubmissions.length / totalStudents) * 100).toFixed(2))
          : 0,
        passRate: checkedSubmissions.length > 0
          ? parseFloat(((passedCount / checkedSubmissions.length) * 100).toFixed(2))
          : 0,
        averageScore: parseFloat(averageScore.toFixed(2))
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

module.exports = router;
