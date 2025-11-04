import { IsArray, ArrayNotEmpty } from 'class-validator';

export class ReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  ids!: string[]; // ← definite assignment operator
}
