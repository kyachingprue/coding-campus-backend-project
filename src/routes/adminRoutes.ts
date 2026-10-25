const express = require("express");
const admin = require("../controllers/adminController");
const { listUsers, updateUserRole } = admin;
const { requireAuth, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { mongoIdParams } = require("../middleware/schemas");
const router = express.Router();
router.use(requireAuth, authorize("admin"));
router.get("/analytics", admin.getAnalytics);
router.get("/students", admin.listStudents);
router.get("/instructors", admin.listInstructors);
router.get("/users", listUsers);
router.patch("/users/:id/role", validate(mongoIdParams), updateUserRole);
router.get("/payments", admin.listPayments);
router.get("/settings", admin.getAdminSettings);
module.exports = router;

export {};
