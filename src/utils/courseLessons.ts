interface Lesson {
  _id?: { toString(): string } | string;
  title: string;
  videoUrl?: string;
  videoDriveFileId?: string;
  durationSeconds?: number;
  freePreview?: boolean;
  order: number;
  resources?: { title: string; url: string }[];
}

interface CourseWithLessons {
  sections?: { _id?: { toString(): string } | string; title: string; order: number; lessons: Lesson[] }[];
  videoLessons?: Lesson[];
  videoUrl?: string;
  videoDriveFileId?: string;
  videoDurationSeconds?: number;
  name?: string;
}

export interface CourseLesson extends Lesson {
  id: string;
  sectionTitle: string;
  videoUrl: string;
  videoDriveFileId: string;
  durationSeconds: number;
  freePreview: boolean;
  resources: { title: string; url: string }[];
}

function idOf(value: Lesson["_id"] | undefined): string {
  return value ? String(value) : "";
}

export function courseLessons(course: CourseWithLessons): CourseLesson[] {
  const sections = course.sections || [];
  if (sections.length) {
    return sections
      .flatMap((section) => section.lessons.map((lesson) => ({
        ...lesson,
        id: `s:${idOf(section._id)}:${idOf(lesson._id)}`,
        sectionTitle: section.title,
        videoUrl: lesson.videoUrl || "",
        videoDriveFileId: lesson.videoDriveFileId || "",
        durationSeconds: Number(lesson.durationSeconds) || 0,
        freePreview: lesson.freePreview === true,
        resources: lesson.resources || [],
      })))
      .sort((left, right) => {
        const leftSection = sections.find((section) => `s:${idOf(section._id)}` === left.id.split(":").slice(0, 2).join(":"));
        const rightSection = sections.find((section) => `s:${idOf(section._id)}` === right.id.split(":").slice(0, 2).join(":"));
        return (leftSection?.order || 0) - (rightSection?.order || 0) || left.order - right.order;
      });
  }
  const flatLessons = (course.videoLessons || []).map((lesson, index) => ({
    ...lesson,
    id: `v:${idOf(lesson._id) || index}`,
    sectionTitle: "Course content",
    videoUrl: lesson.videoUrl || "",
    videoDriveFileId: lesson.videoDriveFileId || "",
    durationSeconds: Number(lesson.durationSeconds) || 0,
    freePreview: lesson.freePreview === true,
    resources: lesson.resources || [],
  }));
  if (!flatLessons.length && course.videoUrl) {
    flatLessons.push({
      title: course.name || "Course video",
      order: 0,
      id: "root:video",
      sectionTitle: "Course content",
      videoUrl: course.videoUrl,
      videoDriveFileId: course.videoDriveFileId || "",
      durationSeconds: Number(course.videoDurationSeconds) || 0,
      freePreview: false,
      resources: [],
    });
  }
  return flatLessons.sort((left, right) => left.order - right.order);
}

export function courseCurriculum(course: CourseWithLessons) {
  const lessons = courseLessons(course);
  const sectionTitles = (course.sections || []).slice().sort((a, b) => a.order - b.order);
  if (!sectionTitles.length) {
    return lessons.length ? [{
      title: "Course content",
      order: 0,
      lessons: lessons.map(({ id, title, order, freePreview, durationSeconds }) => ({
        id, title, order, freePreview, durationSeconds,
      })),
    }] : [];
  }
  return sectionTitles.map((section) => ({
    title: section.title,
    order: section.order,
    lessons: lessons
      .filter((lesson) => lesson.id.startsWith(`s:${idOf(section._id)}:`))
      .map(({ id, title, order, freePreview, durationSeconds }) => ({
        id, title, order, freePreview, durationSeconds,
      })),
  }));
}

export {};
