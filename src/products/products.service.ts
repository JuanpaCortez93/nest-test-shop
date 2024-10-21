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
import { DeleteResult, Repository } from 'typeorm';
import { PaginationDto } from '../common/dto/pagination.dto';
import { validate as isUUID } from 'uuid';

@Injectable()
export class ProductsService {
  private readonly logger: Logger = new Logger('ProdcutsService');

  constructor(
    @InjectRepository(Product)
    private readonly productEntityService: Repository<Product>,
  ) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    try {
      const product = this.productEntityService.create(createProductDto);
      await this.productEntityService.save(product);

      return product;
    } catch (error) {
      this.handleDbExceptions(error);
    }
  }

  async findAll(paginationDto: PaginationDto): Promise<Product[]> {
    const { limit = 10, offset = 0 } = paginationDto;

    const products = this.productEntityService.find({
      take: limit,
      skip: offset,
    });

    return products;
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
        .getOne();
    }

    if (!product) {
      throw new NotFoundException(`Product with id ${param} not found`);
    }

    return product;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    await this.findOne(id);

    const product = await this.productEntityService.preload({
      id,
      ...updateProductDto,
    });

    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    try {
      await this.productEntityService.save(product);

      return product;
    } catch (error) {
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
}
