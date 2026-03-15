import {
  IsArray,
  IsString,
  IsOptional,
  IsNumber,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SearchResultDto {
  @IsString()
  source!: string;

  @IsString()
  title!: string;

  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsString()
  created_at?: string;
}

export class TestScraperDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SearchResultDto)
  searchResults!: SearchResultDto[];
}
