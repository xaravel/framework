// Illuminate\Contracts\Debug\ShouldntReport, from laravel/framework v13.37.0.
import { contract } from "../Contract";

declare const ShouldntReportBrand: unique symbol;

export interface ShouldntReport {
  readonly [ShouldntReport.brand]: true;
}

export const ShouldntReport = contract<ShouldntReport, typeof ShouldntReportBrand>("Illuminate\\Contracts\\Debug\\ShouldntReport");
