import { prisma } from "../lib/prisma.js";

class UserRepository {
  async upsertByEmail(data: { email: string; name: string; surname: string }) {
    return prisma.user.upsert({
      where: {
        email: data.email,
      },
      update: {
        name: data.name,
        surname: data.surname,
      },
      create: {
        email: data.email,
        name: data.name,
        surname: data.surname,
      },
    });
  }

  async findById(id: string) {
    return prisma.user.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
      },
    });
  }
}

export const userRepository = new UserRepository();
