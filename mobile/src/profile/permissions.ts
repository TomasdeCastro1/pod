import type { Member, Role } from '@app/shared';

/** Qué puede hacer cada rol en la configuración de una empresa (los miembros ven, el admin edita). */
export interface CompanyPermissions {
  canEditData: boolean;
  canEditFields: boolean;
  canManageMembers: boolean;
  canRegenerateCode: boolean;
}

export function companyPermissions(role: Role | null | undefined): CompanyPermissions {
  const admin = role === 'admin';
  return {
    canEditData: admin,
    canEditFields: admin,
    canManageMembers: admin,
    canRegenerateCode: admin,
  };
}

export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', miembro: 'Miembro' };

export interface MemberActions {
  canChangeRole: boolean;
  canRemove: boolean;
  /** Rol al que pasaría con «cambiar rol». */
  nextRole: Role;
}

/** Acciones disponibles sobre un miembro. El servidor impide dejar la empresa sin admins (409). */
export function memberActions(viewerRole: Role | null | undefined, member: Member): MemberActions {
  const admin = viewerRole === 'admin';
  return {
    canChangeRole: admin,
    canRemove: admin,
    nextRole: member.role === 'admin' ? 'miembro' : 'admin',
  };
}

export function memberDisplayName(m: Pick<Member, 'nombre' | 'email'>): string {
  return m.nombre?.trim() || m.email;
}

/** Mensajes claros para los errores de miembros que conviene reescribir. */
export function memberErrorMessage(code: string | undefined, fallback: string): string {
  if (code === 'last_admin') {
    return 'No se puede: la empresa necesita al menos un administrador. Nombrá a otro administrador primero.';
  }
  return fallback;
}

export function companyRoleText(role: Role): string {
  return ROLE_LABELS[role];
}
