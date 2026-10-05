import { describe, expect, it } from 'vitest';
import type { Member } from '@app/shared';
import {
  companyPermissions,
  memberActions,
  memberDisplayName,
  memberErrorMessage,
} from './permissions';

const m: Member = { id: 'u1', nombre: null, email: 'a@b.uy', role: 'miembro' };

describe('companyPermissions', () => {
  it('el admin edita todo', () => {
    expect(companyPermissions('admin')).toEqual({
      canEditData: true,
      canEditFields: true,
      canManageMembers: true,
      canRegenerateCode: true,
    });
  });
  it('el miembro solo mira', () => {
    expect(Object.values(companyPermissions('miembro')).every((v) => v === false)).toBe(true);
  });
  it('sin rol no puede nada', () => {
    expect(companyPermissions(null).canEditData).toBe(false);
  });
});

describe('memberActions', () => {
  it('admin puede cambiar rol y quitar; el rol alterna', () => {
    expect(memberActions('admin', m)).toEqual({
      canChangeRole: true,
      canRemove: true,
      nextRole: 'admin',
    });
    expect(memberActions('admin', { ...m, role: 'admin' }).nextRole).toBe('miembro');
  });
  it('miembro no puede', () => {
    const a = memberActions('miembro', m);
    expect(a.canChangeRole || a.canRemove).toBe(false);
  });
});

describe('textos', () => {
  it('nombre o email', () => {
    expect(memberDisplayName(m)).toBe('a@b.uy');
    expect(memberDisplayName({ ...m, nombre: ' Ana ' })).toBe('Ana');
  });
  it('último admin', () => {
    expect(memberErrorMessage('last_admin', 'x')).toMatch(/al menos un administrador/);
    expect(memberErrorMessage('otro', 'x')).toBe('x');
  });
});
