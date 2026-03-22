import { SplitCommentService } from "@/split-comments/provider/provider.service";
import { Test, TestingModule } from "@nestjs/testing";
import { MentionService } from "../provider/service"; // adjust path if needed
import { EventEmitter2 } from "@nestjs/event-emitter";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SplitComment } from "@/split-comments/split-comment.entity"; // adjust path if needed

describe("Service", () => {
  let provider: SplitCommentService;

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

    provider = module.get<SplitCommentService>(SplitCommentService);
  });

  it("should be defined", () => {
    expect(provider).toBeDefined();
  });
});
