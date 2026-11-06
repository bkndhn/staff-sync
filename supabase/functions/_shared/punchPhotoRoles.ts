/** Roles that record punches and may attach / view kiosk punch photos. Staff never can. */
export const PUNCH_PHOTO_ROLES = ["super_admin", "admin", "manager", "supervisor", "floor_supervisor"];
export const canHandlePunchPhoto = (role: string) => PUNCH_PHOTO_ROLES.includes(role);
