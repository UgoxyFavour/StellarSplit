import { Test, TestingModule } from "@nestjs/testing";
import { SplitCommentService } from "./provider.service";
import { MentionService } from "../../mentions/provider/service"; // adjust path if needed
import { EventEmitter2 } from "@nestjs/event-emitter";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SplitComment } from "../split-comment.entity"; // adjust path if needed

describe("SplitCommentService", () => {
  let service: SplitCommentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SplitCommentService,
        {
          provide: getRepositoryToken(SplitComment),
          useValue: { find: jest.fn(), save: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: MentionService,
          useValue: { createMentions: jest.fn() },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SplitCommentService>(SplitCommentService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });
});
