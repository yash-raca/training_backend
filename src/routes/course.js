const express = require('express');
const { PrismaClient } = require('@prisma/client');
const authenticateToken = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = express.Router();
const prisma = new PrismaClient();

// ===== COURSE MANAGEMENT ROUTES =====

// Get all courses (public)
router.get('/courses',
  authenticateToken,
  authorize('view_courses'),
  async (req, res) => {
    try {
      const courses = await prisma.course.findMany({
        include: {
          createdBy: { select: { id: true, email: true, fullName: true } },
          modules: true,
          _count: { select: { enrollments: true } },
          categories: true
        }
      });
      res.json(courses);
    } catch (error) {
      console.error('Error fetching courses:', error);
      res.status(500).json({ message: 'Error fetching courses' });
    }
  }
);

// Create a new course (protected)
router.post('/courses',
  authenticateToken,
  authorize('create_courses'),
  async (req, res) => {
    const { title, description, categoryIds } = req.body; // categoryIds is array of Course_Category IDs

    try {
      const course = await prisma.course.create({
        data: {
          title,
          description,
          createdById: req.user.userId,
          ...(Array.isArray(categoryIds) && categoryIds.length > 0 ? {
            categories: {
              connect: categoryIds.map(id => ({ id }))
            }
          } : {})
        },
        include: {
          createdBy: { select: { id: true, email: true, fullName: true } },
          categories: true  // includes Course_Category[]
        }
      });

      res.status(201).json(course);
    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).json({ message: 'Error creating course' });
    }
  }
);


// Get single course by ID (public)
router.get('/courses/:id',
  authenticateToken,
  authorize('view_single_course'),
  async (req, res) => {
    try {
      const course = await prisma.course.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          createdBy: { select: { id: true, email: true, fullName: true } },
          modules: { orderBy: { order: 'asc' } },
          enrollments: { include: { user: { select: { id: true, email: true } } } },
          categories: true
        }
      });
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      res.json(course);
    } catch (error) {
      console.error('Error fetching course:', error);
      res.status(500).json({ message: 'Error fetching course' });
    }
  }
);

// Update course (PUT /courses/:id)
router.put('/courses/:id',
  authenticateToken,
  authorize('update_course'),
  async (req, res) => {
    const { title, description, categoryIds } = req.body; // categoryIds optional array
    const courseId = parseInt(req.params.id);

    try {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { role: true }
      });

      if (course.createdById !== req.user.userId && user.role.name !== 'admin') {
        return res.status(403).json({ message: 'Access denied: You can only update your own courses' });
      }

      const updatedCourse = await prisma.course.update({
        where: { id: courseId },
        data: {
          ...(title && { title }),
          ...(description && { description }),
          ...(Array.isArray(categoryIds) && {
            categories: {
              set: categoryIds.map(id => ({ id }))
            }
          })
        },
        include: {
          createdBy: { select: { id: true, email: true, fullName: true } },
          categories: true
        }
      });

      res.json(updatedCourse);
    } catch (error) {
      console.error('Error updating course:', error);
      res.status(500).json({ message: 'Error updating course' });
    }
  }
);

// Delete course (protected + ownership check)
router.delete('/courses/:id',
  authenticateToken,
  authorize('delete_course'),
  async (req, res) => {
    const courseId = parseInt(req.params.id);

    try {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: { role: true }
      });

      if (course.createdById !== req.user.userId && user.role.name !== 'admin') {
        return res.status(403).json({ message: 'Access denied: You can only delete your own courses' });
      }

      await prisma.course.delete({ where: { id: courseId } });

      res.json({ message: 'Course deleted successfully' });
    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({ message: 'Error deleting course' });
    }
  }
);

// Enroll trainee in a course (protected)
router.post('/courses/:id/enroll',
  authenticateToken,
  authorize('enroll_courses'),
  async (req, res) => {
    const courseId = parseInt(req.params.id);
    // If traineeUserId is not provided, default to logged-in user (self-enrollment)
    const traineeUserId = req.body.traineeUserId || req.user.userId;

    try {
      // Confirm the course exists
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }

      // Confirm the trainee user exists
      const traineeUser = await prisma.user.findUnique({ where: { id: traineeUserId } });
      if (!traineeUser) {
        return res.status(404).json({ message: 'User to enroll not found' });
      }

      // Check for existing enrollment to avoid duplicates
      const existingEnrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: traineeUserId,
            courseId
          }
        }
      });

      if (existingEnrollment) {
        return res.status(400).json({ message: 'Already enrolled in this course' });
      }

      // Create enrollment with the enroller set as the logged-in user
      const enrollment = await prisma.enrollment.create({
        data: {
          userId: traineeUserId,
          courseId,
          enrolledById: req.user.userId  // The user performing the enrollment
        }
      });

      res.status(201).json({ message: 'Enrolled successfully', enrollment });
    } catch (error) {
      console.error('Error enrolling:', error);
      res.status(500).json({ message: 'Error enrolling in course' });
    }
  }
);


// Get enrolled courses for a specific user with detailed information
router.get('/users/:userId/enrolled-courses',
  authenticateToken,
  authorize('view_enrolled_courses_by_user_id'),
  async (req, res) => {
    const userId = parseInt(req.params.userId);

    try {
      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        include: {
          enrolledBy: { select: { id: true, email: true } },
          course: {
            select: {
              id: true,
              title: true,
              description: true,
              modules: {
                select: {
                  id: true,
                  title: true,
                  content: true,
                  order: true,
                  videoLink: true,
                  moduleProgresses: {
                    where: { userId },
                    select: { completed: true }
                  }
                },
                orderBy: { order: 'asc' }
              },
              categories: {
                select: { id: true, name: true }
              }
            },
          }
        }
      });

      // Format response
      const courses = enrollments.map(enrollment => ({
        id: enrollment.course.id,
        title: enrollment.course.title,
        description: enrollment.course.description,
        modules: enrollment.course.modules.map(m => ({
          id: m.id,
          title: m.title,
          content: m.content,
          order: m.order,
          videoLink: m.videoLink,
          status: (m.moduleProgresses.length > 0 && m.moduleProgresses[0].completed) ? "Completed" : "Pending"
        })),
        categories: enrollment.course.categories,
        enrolledBy: {
          id: enrollment.enrolledBy.id,
          email: enrollment.enrolledBy.email
        }
      }));

      res.json(courses);
    } catch (error) {
      console.error('Error fetching enrolled courses:', error);
      res.status(500).json({ message: 'Error fetching enrolled courses' });
    }
  }
);




// Unenroll user from a course (protected)
router.delete('/courses/:id/enroll',
  authenticateToken,
  authorize('unenroll_courses'),
  async (req, res) => {
    const courseId = parseInt(req.params.id);

    try {
      const enrollment = await prisma.enrollment.findUnique({
        where: {
          userId_courseId: {
            userId: req.user.userId,
            courseId
          }
        }
      });

      if (!enrollment) {
        return res.status(404).json({ message: 'Not enrolled in this course' });
      }

      await prisma.enrollment.delete({
        where: {
          userId_courseId: {
            userId: req.user.userId,
            courseId
          }
        }
      });

      res.json({ message: 'Unenrolled successfully' });
    } catch (error) {
      console.error('Error unenrolling:', error);
      res.status(500).json({ message: 'Error unenrolling from course' });
    }
  }
);

// ===== Course Category Management Routes =====

// Get all course categories (protected)
router.get('/categories',
  authenticateToken,
  authorize('view_course_categories'),
  async (req, res) => {
    try {
      const categories = await prisma.course_Category.findMany({ orderBy: { name: 'asc' } });
      res.json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ message: 'Error fetching categories' });
    }
  }
);

// Create a new course category (protected)
router.post('/categories',
  authenticateToken,
  authorize('create_course_categories'),
  async (req, res) => {
    const { name } = req.body;
    try {
      const existing = await prisma.course_Category.findUnique({ where: { name } });
      if (existing) {
        return res.status(400).json({ message: 'Category already exists' });
      }
      const category = await prisma.course_Category.create({ data: { name } });
      res.status(201).json(category);
    } catch (error) {
      console.error('Error creating category:', error);
      res.status(500).json({ message: 'Error creating category' });
    }
  }
);


// ===== MODULE MANAGEMENT ROUTES =====

// Get all modules for a course (protected)
router.get('/courses/:courseId/modules',
  authenticateToken,
  authorize('view_modules'),
  async (req, res) => {
    try {
      const courseId = parseInt(req.params.courseId);
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }
      const modules = await prisma.module.findMany({
        where: { courseId },
        orderBy: { order: 'asc' },
        select: {
          id: true,
          title: true,
          content: true,
          order: true,
          videoLink: true,
          createdAt: true,
          updatedAt: true
        }
      });
      res.json(modules);
    } catch (error) {
      console.error('Error fetching modules:', error);
      res.status(500).json({ message: 'Error fetching modules' });
    }
  }
);

// Create a new module in a course (protected + ownership check)
router.post('/courses/:courseId/modules', 
  authenticateToken,
  authorize('create_modules'),
  async (req, res) => {
    const { title, content, videoLink } = req.body; // receive videoLink
    const courseId = parseInt(req.params.courseId);
    try {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) {
        return res.status(404).json({ message: 'Course not found' });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, include: { role: true } });
      if (course.createdById !== req.user.userId && user.role.name !== 'admin') {
        return res.status(403).json({ message: 'Access denied: You can only manage your own courses' });
      }

      const lastModule = await prisma.module.findFirst({
        where: { courseId },
        orderBy: { order: 'desc' }
      });
      const nextOrder = lastModule ? lastModule.order + 1 : 1;

      const module = await prisma.module.create({
        data: {
          title,
          content,
          courseId,
          order: nextOrder,
          videoLink // include videoLink here
        }
      });
      res.status(201).json(module);
    } catch (error) {
      console.error('Error creating module:', error);
      res.status(500).json({ message: 'Error creating module' });
    }
  }
);

// Get single module (public)
router.get('/modules/:moduleId',
  authenticateToken,
  authorize('get_single_module'), 
  async (req, res) => {
    try {
      const moduleId = parseInt(req.params.moduleId);
      const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: { 
          course: {
            select: { id: true, title: true, createdById: true }
          }
        }
      });
      if (!module) {
        return res.status(404).json({ message: 'Module not found' });
      }
      res.json(module);
    } catch (error) {
      console.error('Error fetching module:', error);
      res.status(500).json({ message: 'Error fetching module' });
    }
  }
);

// Update module (protected + ownership check)
router.put('/modules/:moduleId', 
  authenticateToken,
  authorize('update_module'),
  async (req, res) => {
    const { title, content, order, videoLink } = req.body; // include videoLink
    const moduleId = parseInt(req.params.moduleId);
    try {
      const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: { course: true }
      });
      if (!module) {
        return res.status(404).json({ message: 'Module not found' });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, include: { role: true } });
      if (module.course.createdById !== req.user.userId && user.role.name !== 'admin') {
        return res.status(403).json({ message: 'Access denied: You can only manage your own course modules' });
      }
      const updatedModule = await prisma.module.update({
        where: { id: moduleId },
        data: {
          ...(title && { title }),
          ...(content && { content }),
          ...(order && { order }),
          ...(videoLink && { videoLink }) // update videoLink
        }
      });
      res.json(updatedModule);
    } catch (error) {
      console.error('Error updating module:', error);
      res.status(500).json({ message: 'Error updating module' });
    }
  }
);

// Delete module (protected + ownership check)
router.delete('/modules/:moduleId', 
  authenticateToken,
  authorize('delete_module'),
  async (req, res) => {
    const moduleId = parseInt(req.params.moduleId);
    try {
      const module = await prisma.module.findUnique({ where: { id: moduleId }, include: { course: true } });
      if (!module) {
        return res.status(404).json({ message: 'Module not found' });
      }
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, include: { role: true } });
      if (module.course.createdById !== req.user.userId && user.role.name !== 'admin') {
        return res.status(403).json({ message: 'Access denied: You can only manage your own course modules' });
      }
      await prisma.module.delete({ where: { id: moduleId } });
      res.json({ message: 'Module deleted successfully' });
    } catch (error) {
      console.error('Error deleting module:', error);
      res.status(500).json({ message: 'Error deleting module' });
    }
  }
);

// Reorder modules in a course (protected + ownership check)
router.put('/courses/:courseId/modules/reorder', 
  authenticateToken,
  authorize('reorder_module'),
  async (req, res) => {
    const { moduleOrders } = req.body; // Array of { moduleId, order }
    const courseId = parseInt(req.params.courseId);
    try {
      const course = await prisma.course.findUnique({ where: { id: courseId } });
      if (!course) { return res.status(404).json({ message: 'Course not found' }); }
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, include: { role: true } });
      if (course.createdById !== req.user.userId && user.role.name !== 'admin') { return res.status(403).json({ message: 'Access denied: You can only manage your own courses' }); }

      const moduleIds = moduleOrders.map(item => item.moduleId);
      const modules = await prisma.module.findMany({ where: { id: { in: moduleIds }, courseId } });
      if (modules.length !== moduleIds.length) { return res.status(400).json({ message: 'Some modules do not belong to this course' }); }

      for (const item of moduleOrders) {
        await prisma.module.update({ where: { id: item.moduleId }, data: { order: item.order } });
      }
      res.json({ message: 'Modules reordered successfully' });
    } catch (error) {
      console.error('Error reordering modules:', error);
      res.status(500).json({ message: 'Error reordering modules' });
    }
  }
);

//update module completion status for a user
router.patch('/modules/:moduleId/status',
  authenticateToken,
  authorize('update_module_completion_status'),
  async (req, res) => {
    const moduleId = parseInt(req.params.moduleId);
    const userId = req.user.userId;
    const { completed } = req.body;

    if (typeof completed !== 'boolean') {
      return res.status(400).json({ message: '`completed` must be a boolean' });
    }

    try {
      const progress = await prisma.moduleProgress.upsert({
        where: { userId_moduleId: { userId, moduleId } },
        update: { completed },
        create: { userId, moduleId, completed }
      });

      res.json({ message: 'Module status updated', progress });
    } catch (error) {
      console.error('Error updating module status:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

router.patch('/test-patch', (req, res) => {
  res.send('Patch route working');
});

module.exports = router;
