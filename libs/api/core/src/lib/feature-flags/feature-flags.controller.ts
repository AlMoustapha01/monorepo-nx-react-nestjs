import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  featureFlagDefinition,
  type FeatureFlagsResponse,
  featureFlagsResponseSchema,
} from '@nx-react-nestjs/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { FeatureFlags } from './feature-flags';

class FeatureFlagsDto extends createZodDto(featureFlagsResponseSchema) {}

const CLIENT_FLAGS = (Object.keys(FEATURE_FLAGS) as FeatureFlag[]).filter(
  (flag) => featureFlagDefinition(flag).client,
);

/** Le front adapte son interface ; l'API reste seule juge (@RequireFeature, cas d'usage). */
@ApiTags('feature-flags')
@ApiBearerAuth()
@Controller({ path: 'feature-flags', version: '1' })
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlags) {}

  @Get()
  @ZodSerializerDto(FeatureFlagsDto)
  async list(): Promise<FeatureFlagsResponse> {
    const values = await Promise.all(CLIENT_FLAGS.map((flag) => this.flags.isEnabled(flag)));
    return { flags: Object.fromEntries(CLIENT_FLAGS.map((flag, i) => [flag, values[i]])) };
  }
}
