import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  changeProductPriceSchema,
  createProductSchema,
  cursorPageQuerySchema,
  type CursorPage,
  productIdSchema,
  productPageSchema,
  type ProductResponse,
  productSchema,
} from '@nx-react-nestjs/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import type { Product } from '../domain/product';
import { CreateProduct } from '../application/use-cases/create-product';
import { GetProduct } from '../application/use-cases/get-product';
import { ListProducts } from '../application/use-cases/list-products';
import {
  ArchiveProduct,
  ChangeProductPrice,
  PublishProduct,
} from '../application/use-cases/update-product';

class CreateProductDto extends createZodDto(createProductSchema) {}
class ChangeProductPriceDto extends createZodDto(changeProductPriceSchema) {}
class ListProductsQueryDto extends createZodDto(cursorPageQuerySchema) {}
class ProductIdParamsDto extends createZodDto(z.object({ id: productIdSchema })) {}
class ProductDto extends createZodDto(productSchema) {}
class ProductPageDto extends createZodDto(productPageSchema) {}

/** Couche fine : valider (DTO zod), appeler un cas d'usage, sérialiser. Aucune règle métier ici. */
@ApiTags('catalog')
@ApiBearerAuth()
@Controller({ path: 'catalog/products', version: '1' })
export class ProductsController {
  constructor(
    private readonly createProduct: CreateProduct,
    private readonly getProduct: GetProduct,
    private readonly listProducts: ListProducts,
    private readonly changeProductPrice: ChangeProductPrice,
    private readonly publishProduct: PublishProduct,
    private readonly archiveProduct: ArchiveProduct,
  ) {}

  @Post()
  @ZodSerializerDto(ProductDto)
  async create(@Body() body: CreateProductDto): Promise<ProductResponse> {
    return toResponse(await this.createProduct.execute(body));
  }

  @Get()
  @ZodSerializerDto(ProductPageDto)
  async list(@Query() query: ListProductsQueryDto): Promise<CursorPage<ProductResponse>> {
    const page = await this.listProducts.execute(query);
    return { items: page.items.map(toResponse), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @ZodSerializerDto(ProductDto)
  async get(@Param() { id }: ProductIdParamsDto): Promise<ProductResponse> {
    return toResponse(await this.getProduct.execute(id));
  }

  @Patch(':id/price')
  @ZodSerializerDto(ProductDto)
  async changePrice(
    @Param() { id }: ProductIdParamsDto,
    @Body() body: ChangeProductPriceDto,
  ): Promise<ProductResponse> {
    return toResponse(await this.changeProductPrice.execute(id, body));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ZodSerializerDto(ProductDto)
  async publish(@Param() { id }: ProductIdParamsDto): Promise<ProductResponse> {
    return toResponse(await this.publishProduct.execute(id));
  }

  @Post(':id/archive')
  @HttpCode(200)
  @ZodSerializerDto(ProductDto)
  async archive(@Param() { id }: ProductIdParamsDto): Promise<ProductResponse> {
    return toResponse(await this.archiveProduct.execute(id));
  }
}

function toResponse(product: Product): ProductResponse {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: { amountMinor: product.price.amountMinor, currency: product.price.currency },
    status: product.status,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
