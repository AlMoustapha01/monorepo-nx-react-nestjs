import { Module } from '@nestjs/common';
import { CatalogModule } from '@nx-react-nestjs/api-catalog';
import { CoreModule } from '@nx-react-nestjs/api-core';

@Module({
  imports: [CoreModule, CatalogModule],
})
export class AppModule {}
