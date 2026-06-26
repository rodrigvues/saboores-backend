type FlavorRecord = {
  id: string;
  name: string;
  isSweet: boolean;
  eventId: string | null;
  active?: boolean;
};

export type FlavorDto = {
  id: string;
  name: string;
  isSweet: boolean;
  eventId: string | null;
  /** `true` quando é um sabor padrão do sistema (sem evento). */
  isGlobal: boolean;
  /** O usuário atual pode editar este sabor (ADMIN, ou organizador do evento extra). */
  canEdit: boolean;
};

export function toFlavorDto(flavor: FlavorRecord, canEdit: boolean): FlavorDto {
  return {
    id: flavor.id,
    name: flavor.name,
    isSweet: flavor.isSweet,
    eventId: flavor.eventId,
    isGlobal: flavor.eventId === null,
    canEdit,
  };
}
