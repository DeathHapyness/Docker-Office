import type { ContainerView } from '../model.js';
import type { CharacterProfile } from './types.js';

/**
 * Escolhe o perfil de um container: nome do serviço/container primeiro, depois imagem.
 * Retorna undefined quando não há perfil (o chamador decide o que fazer).
 */
export function resolveProfile(
  c: Pick<ContainerView, 'name' | 'service' | 'image'>,
  profiles: readonly CharacterProfile[],
): CharacterProfile | undefined {
  const names = [c.service, c.name].filter((n): n is string => !!n).map((n) => n.toLowerCase());
  const byName = profiles.find((p) => p.match.names?.some((n) => names.includes(n.toLowerCase())));
  if (byName) return byName;
  const image = c.image.toLowerCase();
  return profiles.find((p) => p.match.images?.some((i) => image.includes(i.toLowerCase())));
}
