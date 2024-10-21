import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Product } from './entities/product.entity';
import { DataSource, DeleteResult, Repository } from 'typeorm';
import { PaginationDto } from '../common/dto/pagination.dto';
import { validate as isUUID } from 'uuid';
import { ProductImage } from './entities';

@Injectable()
export class ProductsService {
  private readonly logger: Logger = new Logger('ProdcutsService');

  constructor(
    @InjectRepository(Product)
    private readonly productEntityService: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly productImageEntityService: Repository<ProductImage>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      const { images = [], ...productDetails } = createProductDto;

      const product = this.productEntityService.create({
        ...productDetails,
        images: images.map((image) =>
          this.productImageEntityService.create({ url: image }),
        ),
      });
      await this.productEntityService.save(product);

      return product;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;

    const products = await this.productEntityService.find({
      take: limit,
      skip: offset,
      relations: {
        images: true,
      },
    });

    return products.map((product) => ({
      ...product,
      images: product.images.map((image) => image.url),
    }));
  }

  async findOne(param: string): Promise<Product> {
    let product: Product;

    if (isUUID(param)) {
      product = await this.productEntityService.findOneBy({ id: param });
    } else {
      const queryBuilder =
        this.productEntityService.createQueryBuilder('product');
      product = await queryBuilder
        .where(`product.title = LOWER(:title) OR product.slug = LOWER(:slug)`, {
          title: param,
          slug: param,
        })
        .leftJoinAndSelect('product.images', 'image')
        .getOne();
    }

    if (!product) {
      throw new NotFoundException(`Product with id ${param} not found`);
    }

    return product;
  }

  async findOnePlain(term: string) {
    const { images = [], ...rest } = await this.findOne(term);
    return {
      ...rest,
      images: images.map((image) => image.url),
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    const { images, ...toUpdate } = updateProductDto;

    const product = await this.productEntityService.preload({
      id,
      ...toUpdate,
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    // Create query runner
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (images) {
        await queryRunner.manager.delete(ProductImage, { product: { id } });
        product.images = images.map((image) =>
          this.productImageEntityService.create({ url: image }),
        );
      } else {
      }

      // await this.productEntityService.save(product);
      await queryRunner.manager.save(product);
      await queryRunner.commitTransaction();
      await queryRunner.release();

      return this.findOnePlain(id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();

      this.handleDbExceptions(error);
    }
  }

  async remove(id: string): Promise<DeleteResult> {
    await this.findOne(id);
    return this.productEntityService.delete(id);
  }

  private handleDbExceptions(error: any) {
    if (error.code === '23505') {
      throw new BadRequestException('Product already exists');
    }

    throw new InternalServerErrorException(
      'Unexpected error, check server logs',
    );

    this.logger.error(error.message);
  }

  async deleteAllProducts() {
    const query = this.productEntityService.createQueryBuilder('product');

    try {
      return query.delete().where({}).execute();
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }
}
