import { join } from 'path';
import { BadRequestException, Injectable } from '@nestjs/common';
import { existsSync } from 'fs';

@Injectable()
export class FilesService {
  getStaticProductImage(imageName: string) {
    const path = join(__dirname, '..', '..', 'static', 'uploads', imageName);

    if (!existsSync(path)) {
      throw new BadRequestException(
        `Not product found with image ${imageName}`,
      );
    }

    return path;
  }
}
