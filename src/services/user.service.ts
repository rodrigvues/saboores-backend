import { toUserDto } from "../dtos/user.dto.js";
import { userRepository } from "../repositories/user.repository.js";

class UserService {
  async identify(data: { email: string; name: string; surname: string }) {
    const user = await userRepository.upsertByEmail({
      email: data.email.trim().toLowerCase(),
      name: data.name.trim(),
      surname: data.surname.trim(),
    });

    return toUserDto(user);
  }
}

export const userService = new UserService();
