import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ScrapedEntryDto {
  @IsString()
  source: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  url: string;

  @IsString()
  content: string;
}

export class StoreResearchDataDto {
  @IsString()
  @IsNotEmpty()
  ideaId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScrapedEntryDto)
  entries: ScrapedEntryDto[];
}

export class PrepareResearchDatasetDto {
  @IsString()
  @IsNotEmpty()
  ideaId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
