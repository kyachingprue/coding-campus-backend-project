require("dotenv").config();
const mongoose = require("mongoose");
const Course = require("../models/Course");
const User = require("../models/User");

const catalog = [
  ["js", "JavaScript", "Programming Language", 49],
  ["py", "Python", "Programming Language", 55],
  ["ts", "TypeScript", "Programming Language", 59],
  ["go", "Go", "Programming Language", 69],
  ["rust", "Rust", "Programming Language", 79],
  ["cpp", "C++", "Programming Language", 65],
  ["react", "React", "Framework", 49],
  ["next", "Next.js", "Framework", 59],
  ["vue", "Vue.js", "Framework", 39],
  ["django", "Django", "Framework", 54],
  ["spring", "Spring Boot", "Framework", 69],
  ["laravel", "Laravel", "Framework", 44],
  ["redux", "Redux Toolkit", "Library", 34],
  ["tailwind", "Tailwind CSS", "Library", 29],
  ["express", "Express.js", "Library", 32],
  ["pandas", "Pandas", "Library", 42],
  ["tf", "TensorFlow", "Library", 64],
  ["graphql", "GraphQL", "Library", 36],
];

async function seedCourses() {
  if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI in backend/.env.");
  await mongoose.connect(process.env.MONGODB_URI);
  const instructor = await User.findOne({ role: { $in: ["instructor", "admin"] } });
  if (!instructor) throw new Error("Create an admin account first with npm run seed:admin.");
  for (const [courseId, name, category, price] of catalog) {
    await Course.updateOne(
      { courseId },
      {
        $setOnInsert: {
          courseId,
          name,
          category,
          price,
          description: `Learn ${name} with practical lessons, guided exercises, and hands-on projects.`,
          instructor: instructor.id,
          isPublished: true,
        },
      },
      { upsert: true }
    );
  }
  console.log(`Seeded ${catalog.length} catalog courses.`);
}

seedCourses()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());

export {};
