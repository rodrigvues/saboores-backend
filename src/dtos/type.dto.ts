import type { Prisma } from "@prisma/client";

type TypeListRecord = {
  id: string;
  name: string;
  description: string | null;
  createdByUserId: string;
  _count: { items: number };
};

type TypeDetailRecord = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  createdByUserId: string;
  items: {
    id: string;
    name: string;
    price: Prisma.Decimal;
    active: boolean;
  }[];
};

export type TypeListItemDto = {
  id: string;
  title: string;
  description: string | null;
  itemCount: number;
  /** O requisitante pode editar este tipo (dono ou ADMIN). */
  canEdit: boolean;
};

export type TypeItemDto = {
  id: string;
  title: string;
  /** Decimal como string, ex.: "8". */
  price: string;
  active: boolean;
};

export type TypeDetailDto = {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  canEdit: boolean;
  items: TypeItemDto[];
};

export function toTypeListItemDto(
  type: TypeListRecord,
  canEdit: boolean,
): TypeListItemDto {
  return {
    id: type.id,
    title: type.name,
    description: type.description,
    itemCount: type._count.items,
    canEdit,
  };
}

export function toTypeDetailDto(
  type: TypeDetailRecord,
  canEdit: boolean,
): TypeDetailDto {
  return {
    id: type.id,
    title: type.name,
    description: type.description,
    active: type.active,
    canEdit,
    items: type.items.map((item) => ({
      id: item.id,
      title: item.name,
      price: item.price.toString(),
      active: item.active,
    })),
  };
}
