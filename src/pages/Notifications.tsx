import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatDate, json } from "../api";
import { Empty, Loading, PageHeader } from "../components/UI";

export function NotificationsPage() {
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => api<any[]>("/api/staff/notifications").then(setItems);
  useEffect(() => { void load(); }, []);
  if (!items) return <Loading />;
  const unreadCount = items.filter(item => !item.read_at).length;
  const markRead = (id: number) => {
    setItems(current => current?.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item) ?? null);
    window.dispatchEvent(new Event("notifications-changed"));
    void api(`/api/staff/notifications/${id}/read`, json("POST"));
  };
  const markAllRead = async () => {
    await api("/api/staff/notifications/read-all", json("POST"));
    setItems(current => current?.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })) ?? null);
    window.dispatchEvent(new Event("notifications-changed"));
  };
  return <>
    <PageHeader eyebrow="Attention feed" title="Notifications" description="Assignments, deadlines, submissions, and replies that need your attention."
      actions={unreadCount > 0 && <button className="button button-secondary" onClick={() => void markAllRead()}>Mark all as read</button>} />
    {items.length ? <section className="panel notification-list">{items.map(item =>
      <Link to={item.link || "#"} key={item.id} className={item.read_at ? "" : "unread"} onClick={() => markRead(item.id)}>
        <i /><div><strong>{item.title}</strong><p>{item.body}</p><small>{formatDate(item.created_at, true)}</small></div>
      </Link>)}</section> : <Empty title="You are all caught up" />}
  </>;
}
