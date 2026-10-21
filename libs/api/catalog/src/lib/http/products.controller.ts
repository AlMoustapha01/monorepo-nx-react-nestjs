import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { etagFor, IfMatchVersion, RequireRole } from '@nx-react-nestjs/api-core';
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
import type { Response } from 'express';
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

const IfMatchHeader = () =>
  ApiHeader({
    name: 'If-Match',
    required: false,
    description: 'ETag lu précédemment (ex. "3") : 412 si le produit a changé depuis.',
  });

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
  @RequireRole('staff')
  @ZodSerializerDto(ProductDto)
  async create(
    @Body() body: CreateProductDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withEtag(res, await this.createProduct.execute(body));
  }

  @Get()
  @ZodSerializerDto(ProductPageDto)
  async list(@Query() query: ListProductsQueryDto): Promise<CursorPage<ProductResponse>> {
    const page = await this.listProducts.execute(query);
    return { items: page.items.map(toResponse), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @ZodSerializerDto(ProductDto)
  async get(
    @Param() { id }: ProductIdParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withEtag(res, await this.getProduct.execute(id));
  }

  @Patch(':id/price')
  @RequireRole('staff')
  @IfMatchHeader()
  @ZodSerializerDto(ProductDto)
  async changePrice(
    @Param() { id }: ProductIdParamsDto,
    @Body() body: ChangeProductPriceDto,
    @IfMatchVersion() expectedVersion: number | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withEtag(res, await this.changeProductPrice.execute(id, body, expectedVersion));
  }

  @Post(':id/publish')
  @RequireRole('staff')
  @HttpCode(200)
  @IfMatchHeader()
  @ZodSerializerDto(ProductDto)
  async publish(
    @Param() { id }: ProductIdParamsDto,
    @IfMatchVersion() expectedVersion: number | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withEtag(res, await this.publishProduct.execute(id, undefined, expectedVersion));
  }

  @Post(':id/archive')
  @RequireRole('staff')
  @HttpCode(200)
  @IfMatchHeader()
  @ZodSerializerDto(ProductDto)
  async archive(
    @Param() { id }: ProductIdParamsDto,
    @IfMatchVersion() expectedVersion: number | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ProductResponse> {
    return withEtag(res, await this.archiveProduct.execute(id, undefined, expectedVersion));
  }
}

/** Une réponse sur un produit porte son ETag : le client le renverra dans If-Match. */
function withEtag(res: Response, product: Product): ProductResponse {
  res.setHeader('ETag', etagFor(product.version));
  return toResponse(product);
}

function toResponse(product: Product): ProductResponse {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: { amountMinor: product.price.amountMinor, currency: product.price.currency },
    status: product.status,
    soldCount: product.soldCount,
    version: product.version,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}
