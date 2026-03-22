import { Test, TestingModule } from "@nestjs/testing";
import { ExportController } from "./export.controller";
import { ExportService } from "./export.service";

describe("ExportController", () => {
  let controller: ExportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExportController],
      providers: [
        {
          provide: ExportService,
          useValue: {
            createExportJob: jest.fn(),
            getExportJob: jest.fn(),
            listExportJobs: jest.fn(),
            downloadExport: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ExportController>(ExportController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
