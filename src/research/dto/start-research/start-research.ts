import {
  IsArray,
  IsOptional,
  IsString,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class StartResearchDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  keywords?: string[];
}
