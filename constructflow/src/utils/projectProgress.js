export const countBlueprintUnits = (objects = {}) => {
  const stats = { total: 0, completed: 0 };

  Object.values(objects).forEach((obj) => {
    const pointTasks = Array.isArray(obj?.pointTasks) ? obj.pointTasks : [];
    const requiredPointTasks = pointTasks.filter((task) => task?.requiredType);

    if (requiredPointTasks.length > 0) {
      stats.total += requiredPointTasks.length;
      stats.completed += requiredPointTasks.filter(
        (task) => task.completed,
      ).length;
      return;
    }

    stats.total += 1;
    if (obj?.completed) stats.completed += 1;
  });

  return stats;
};

export const getBlueprintCompletion = (blueprint) => {
  const { total, completed } = countBlueprintUnits(blueprint?.objects || {});
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
};

export const getTaskCompletion = (taskId, blueprints) => {
  const taskBlueprints = blueprints.filter(
    (blueprint) => blueprint.taskId === taskId,
  );
  if (taskBlueprints.length === 0) return 0;

  const totalPercentage = taskBlueprints.reduce(
    (sum, blueprint) => sum + getBlueprintCompletion(blueprint),
    0,
  );

  return Math.round(totalPercentage / taskBlueprints.length);
};

export const getProjectCompletion = (projectTasks = [], blueprints = []) => {
  if (projectTasks.length === 0) return 0;

  const totalTaskCompletion = projectTasks.reduce(
    (sum, task) => sum + getTaskCompletion(task.id, blueprints),
    0,
  );

  return Math.round(totalTaskCompletion / projectTasks.length);
};

export const getEffectiveProjectStatus = (project) => {
  const completion = Number(project?.completion);
  if (Number.isFinite(completion) && completion >= 100) {
    return "completed";
  }
  return project?.status || "active";
};
