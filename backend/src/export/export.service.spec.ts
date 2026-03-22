import { Test, TestingModule } from "@nestjs/testing";
import { ExportService } from "./export.service";
import { ConfigService } from "@nestjs/config";

describe("ExportService", () => {
  let service: ExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        {
          provide: "ExportJobRepository",
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: "ExportTemplateRepository",
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: "PdfGeneratorService", useValue: { generate: jest.fn() } },
        {
          provide: "QuickBooksGeneratorService",
          useValue: { generate: jest.fn() },
        },
        { provide: "OfxGeneratorService", useValue: { generate: jest.fn() } },
        { provide: "EmailService", useValue: { send: jest.fn() } },
        { provide: "StorageService", useValue: { upload: jest.fn() } },
        { provide: "CsvGeneratorService", useValue: { generate: jest.fn() } },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
