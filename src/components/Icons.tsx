import type { SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}
export const GridIcon = () => <Icon><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></Icon>;
export const ProjectIcon = () => <Icon><path d="M4 5h6l2 2h8v12H4z"/><path d="M4 10h16"/></Icon>;
export const TicketIcon = () => <Icon><path d="M4 4h16v5a3 3 0 0 0 0 6v5H4v-5a3 3 0 0 0 0-6z"/><path d="M12 7v2m0 6v2"/></Icon>;
export const RequestIcon = () => <Icon><path d="M6 3h12v18H6z"/><path d="M9 7h6m-6 4h6m-6 4h4"/></Icon>;
export const SettingsIcon = () => <Icon><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></Icon>;
export const ScreenIcon = () => <Icon><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></Icon>;
export const PresentationIcon = () => <Icon><path d="M4 4h16v12H4z"/><path d="M8 20l4-4 4 4"/><path d="M8 11l3-3 2 2 3-3"/></Icon>;
export const BellIcon = () => <Icon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></Icon>;
export const SearchIcon = () => <Icon><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></Icon>;
export const PlusIcon = () => <Icon><path d="M12 5v14M5 12h14"/></Icon>;
export const ArrowIcon = () => <Icon><path d="M5 12h14m-5-5 5 5-5 5"/></Icon>;
export const AlertIcon = () => <Icon><path d="M12 3 2.5 20h19z"/><path d="M12 9v4m0 3h.01"/></Icon>;
export const CheckIcon = () => <Icon><path d="m5 12 4 4L19 6"/></Icon>;
export const ClockIcon = () => <Icon><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>;
