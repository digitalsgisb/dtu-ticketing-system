type User = { id: number; name: string; active: number | boolean };

export function AssigneePicker({ users, value, onChange }: {
  users: User[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  return <fieldset className="assignee-picker">
    <legend>Assignees</legend>
    <div className="assignee-picker-options">
      {users.filter(user => user.active || value.includes(user.id)).map(user =>
        <label key={user.id} className="checkbox">
          <input type="checkbox" checked={value.includes(user.id)} disabled={!user.active}
            onChange={event => onChange(event.target.checked ? [...value, user.id] : value.filter(id => id !== user.id))} />
          {user.name}{!user.active ? " (inactive)" : ""}
        </label>)}
    </div>
    <small>{value.length ? `${value.length} selected · each person receives this task` : "Leave empty for unassigned work"}</small>
  </fieldset>;
}
