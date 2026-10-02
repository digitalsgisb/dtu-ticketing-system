export function TaskProgress({ project, compact = false }: {
  project: { task_total?: number; task_completed?: number; task_progress?: number | null };
  compact?: boolean;
}) {
  if (!project.task_total) return <span className="task-progress-empty">No project tasks yet</span>;
  const completed = project.task_completed ?? 0;
  const percent = project.task_progress ?? 0;
  return <div className={`task-progress${compact ? " task-progress-compact" : ""}`}>
    <div><span>Task completion</span><strong title="Shared tasks advance as each assignee completes their part">{completed} / {project.task_total}{compact ? "" : " fully done"} · {percent}%</strong></div>
    {!compact && <div className="task-progress-track" role="progressbar" aria-label="Project tasks complete" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${percent}%` }} /></div>}
  </div>;
}
