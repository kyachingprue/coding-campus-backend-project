const express = require("express");
const support = require("../controllers/supportController");
const { requireAuth, authorize } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { supportCallSchema, supportCallActionSchema } = require("../middleware/schemas");

const router = express.Router();
router.use(requireAuth, authorize("student", "instructor", "admin"));
router.get("/contacts", support.listContacts);
router.get("/calls", support.listCalls);
router.post("/calls", validate(supportCallSchema), support.createCall);
router.patch("/calls/:id", validate(supportCallActionSchema), support.updateCall);

module.exports = router;

export {};
