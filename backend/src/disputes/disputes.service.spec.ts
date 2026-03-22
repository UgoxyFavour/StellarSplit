import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { DisputesService } from "./disputes.service";
import {
  Dispute,
  DisputeStatus,
  DisputeType,
} from "../entities/dispute.entity";
import { DisputeEvidence } from "../entities/dispute-evidence.entity";
import { Split } from "../entities/split.entity";
import { DisputeStateMachine } from "./dispute.state-machine";
import { DataSource } from "typeorm";
import { BlockchainClient } from "./blockchain.client";

describe("DisputesService", () => {
  let service: DisputesService;
  let disputeRepository: any;
  let evidenceRepository: any;
  let splitRepository: any;
  let dataSource: any;
  let eventEmitter: any;

  const mockDispute: Dispute = {
    id: "dispute-123",
    splitId: "split-456",
    raisedBy: "GXXXXX",
    disputeType: DisputeType.INCORRECT_AMOUNT,
    description: "Amount does not match receipt",
    status: DisputeStatus.OPEN,
    evidence: [],
    resolution: null,
    resolvedBy: null,
    resolvedAt: null,
    resolutionOutcome: null,
    originalDisputeId: null,
    appealReason: null,
    appealedAt: null,
    auditTrail: [],
    splitFrozen: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    split: {} as any,
    appeals: [],
  };

  const mockSplit: Split = {
    id: "split-456",
    totalAmount: 100,
    amountPaid: 0,
    status: "active",
    isFrozen: false,
    description: "Test split",
    preferredCurrency: "XLM",
    creatorWalletAddress: "GYYYYY",
    createdAt: new Date(),
    updatedAt: new Date(),
    items: [],
    participants: [],
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
          },
        },

        {
          provide: getRepositoryToken(DisputeEvidence),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Split),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryRunner: jest.fn(() => ({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                findOne: jest.fn(),
                create: jest.fn(),
                save: jest.fn(),
                update: jest.fn(),
              },
            })),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
        {
          provide: BlockchainClient,
          useValue: {
            freezeSplit: jest.fn().mockResolvedValue({ txHash: "0xabc123" }),
            executeResolution: jest
              .fn()
              .mockResolvedValue({ txHash: "0xdef456" }),
          },
        },
      ],
    }).compile();

    service = module.get<DisputesService>(DisputesService);
    disputeRepository = module.get(getRepositoryToken(Dispute));
    evidenceRepository = module.get(getRepositoryToken(DisputeEvidence));
    splitRepository = module.get(getRepositoryToken(Split));
    dataSource = module.get(DataSource);
    eventEmitter = module.get(EventEmitter2);
  });

  describe("fileDispute", () => {
    it("should create a dispute and freeze the split", async () => {
      const fileDisputeDto = {
        splitId: "split-456",
        disputeType: DisputeType.INCORRECT_AMOUNT,
        description: "Amount does not match receipt",
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValueOnce(mockSplit);
      queryRunner.manager.findOne.mockResolvedValueOnce(null); // No existing active dispute
      queryRunner.manager.create.mockReturnValue(mockDispute);
      queryRunner.manager.save.mockResolvedValueOnce(mockDispute);
      queryRunner.manager.update.mockResolvedValueOnce({ affected: 1 });

      const result = await service.fileDispute(fileDisputeDto, "GXXXXX");

      expect(result).toEqual(mockDispute);
      expect(queryRunner.manager.create).toHaveBeenCalled();
      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        Split,
        { id: "split-456" },
        { isFrozen: true },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "dispute.created",
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "split.frozen",
        expect.any(Object),
      );
    });

    it("should throw NotFoundException if split does not exist", async () => {
      const fileDisputeDto = {
        splitId: "split-999",
        disputeType: DisputeType.INCORRECT_AMOUNT,
        description: "Amount does not match receipt",
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.fileDispute(fileDisputeDto, "GXXXXX"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException if active dispute already exists", async () => {
      const fileDisputeDto = {
        splitId: "split-456",
        disputeType: DisputeType.INCORRECT_AMOUNT,
        description: "Amount does not match receipt",
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValueOnce(mockSplit);
      queryRunner.manager.findOne.mockResolvedValueOnce(mockDispute); // Existing active dispute

      await expect(
        service.fileDispute(fileDisputeDto, "GXXXXX"),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("addEvidence", () => {
    it("should add evidence to a dispute", async () => {
      const addEvidenceDto = {
        disputeId: "dispute-123",
        fileKey: "s3://bucket/evidence-1.jpg",
        fileName: "receipt.jpg",
        mimeType: "image/jpeg",
        size: 2048,
        description: "Receipt image",
      };

      const mockEvidence: DisputeEvidence = {
        id: "evidence-1",
        disputeId: "dispute-123",
        uploadedBy: "GXXXXX",
        fileKey: "s3://bucket/evidence-1.jpg",
        fileName: "receipt.jpg",
        mimeType: "image/jpeg",
        size: 2048,
        description: "Receipt image",
        metadata: null,
        createdAt: new Date(),
        dispute: mockDispute,
      };

      disputeRepository.findOne.mockResolvedValueOnce(mockDispute);
      evidenceRepository.create.mockReturnValue(mockEvidence);
      evidenceRepository.save.mockResolvedValueOnce(mockEvidence);
      disputeRepository.save.mockResolvedValueOnce({
        ...mockDispute,
        evidence: [mockEvidence],
      });

      const result = await service.addEvidence(addEvidenceDto, "GXXXXX");

      expect(result).toEqual(mockEvidence);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "dispute.evidence_added",
        expect.any(Object),
      );
    });

    it("should throw BadRequestException if dispute not in evidence collection status", async () => {
      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
      };

      const addEvidenceDto = {
        disputeId: "dispute-123",
        fileKey: "s3://bucket/evidence-1.jpg",
        fileName: "receipt.jpg",
        mimeType: "image/jpeg",
        size: 2048,
      };

      disputeRepository.findOne.mockResolvedValueOnce(resolvedDispute);

      await expect(
        service.addEvidence(addEvidenceDto, "GXXXXX"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("resolveDispute", () => {
    it("should resolve dispute and unfreeze split", async () => {
      const resolveDisputeDto = {
        disputeId: "dispute-123",
        outcome: "adjust_balances" as const,
        resolution: "Balances adjusted based on evidence review",
        details: { adjustment: 50 },
      };

      const queryRunner = dataSource.createQueryRunner();
      const underReviewDispute = {
        ...mockDispute,
        status: DisputeStatus.UNDER_REVIEW,
      };

      queryRunner.manager.findOne
        .mockResolvedValueOnce(underReviewDispute)
        .mockResolvedValueOnce(mockSplit);
      queryRunner.manager.save.mockResolvedValueOnce({
        ...underReviewDispute,
        status: DisputeStatus.RESOLVED,
      });
      queryRunner.manager.update.mockResolvedValueOnce({ affected: 1 });

      const result = await service.resolveDispute(
        resolveDisputeDto,
        "admin-wallet",
      );

      expect(result.status).toEqual(DisputeStatus.RESOLVED);
      expect(queryRunner.manager.update).toHaveBeenCalledWith(
        Split,
        { id: "split-456" },
        {
          isFrozen: false,
        },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "dispute.resolved",
        expect.any(Object),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "split.unfrozen",
        expect.any(Object),
      );
    });

    it("should throw BadRequestException for invalid state transition", async () => {
      const resolveDisputeDto = {
        disputeId: "dispute-123",
        outcome: "adjust_balances" as const,
        resolution: "Balances adjusted",
        details: {},
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValueOnce(mockDispute); // OPEN status

      // OPEN -> RESOLVED is invalid
      await expect(
        service.resolveDispute(resolveDisputeDto, "admin"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("appealDispute", () => {
    it("should appeal a resolved dispute", async () => {
      const appealDisputeDto = {
        disputeId: "dispute-123",
        appealReason: "The resolution was unfair and biased",
      };

      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
        resolvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValueOnce(resolvedDispute);
      queryRunner.manager.save.mockResolvedValueOnce({
        ...resolvedDispute,
        status: DisputeStatus.APPEALED,
      });
      queryRunner.manager.update.mockResolvedValueOnce({ affected: 1 });

      const result = await service.appealDispute(appealDisputeDto, "GXXXXX");

      expect(result.status).toEqual(DisputeStatus.APPEALED);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "dispute.appealed",
        expect.any(Object),
      );
    });

    it("should throw BadRequestException if appeal window expired", async () => {
      const appealDisputeDto = {
        disputeId: "dispute-123",
        appealReason: "The resolution was unfair",
      };

      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
        resolvedAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValueOnce(resolvedDispute);

      await expect(
        service.appealDispute(appealDisputeDto, "GXXXXX"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw ForbiddenException if non-creator tries to appeal", async () => {
      const appealDisputeDto = {
        disputeId: "dispute-123",
        appealReason: "The resolution was unfair",
      };

      const resolvedDispute = {
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
        raisedBy: "GXXXXX",
        resolvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      };

      const queryRunner = dataSource.createQueryRunner();
      queryRunner.manager.findOne.mockResolvedValueOnce(resolvedDispute);

      await expect(
        service.appealDispute(appealDisputeDto, "GYYYYYY"),
      ).rejects.toThrow("Only the party that raised the dispute can appeal");
    });
  });

  describe("DisputeStateMachine", () => {
    it("should allow valid transitions", () => {
      expect(
        DisputeStateMachine.canTransition(
          DisputeStatus.OPEN,
          DisputeStatus.EVIDENCE_COLLECTION,
        ),
      ).toBe(true);
      expect(
        DisputeStateMachine.canTransition(
          DisputeStatus.EVIDENCE_COLLECTION,
          DisputeStatus.UNDER_REVIEW,
        ),
      ).toBe(true);
      expect(
        DisputeStateMachine.canTransition(
          DisputeStatus.UNDER_REVIEW,
          DisputeStatus.RESOLVED,
        ),
      ).toBe(true);
      expect(
        DisputeStateMachine.canTransition(
          DisputeStatus.RESOLVED,
          DisputeStatus.APPEALED,
        ),
      ).toBe(true);
    });

    it("should reject invalid transitions", () => {
      expect(() =>
        DisputeStateMachine.validateTransition(
          DisputeStatus.OPEN,
          DisputeStatus.RESOLVED,
        ),
      ).toThrow(BadRequestException);

      expect(() =>
        DisputeStateMachine.validateTransition(
          DisputeStatus.RESOLVED,
          DisputeStatus.EVIDENCE_COLLECTION,
        ),
      ).toThrow(BadRequestException);
    });

    it("should identify terminal states", () => {
      expect(DisputeStateMachine.isTerminalState(DisputeStatus.RESOLVED)).toBe(
        true,
      );
      expect(DisputeStateMachine.isTerminalState(DisputeStatus.REJECTED)).toBe(
        true,
      );
      expect(DisputeStateMachine.isTerminalState(DisputeStatus.OPEN)).toBe(
        false,
      );
    });

    it("should check evidence submission allowed", () => {
      expect(
        DisputeStateMachine.allowsEvidenceSubmission(DisputeStatus.OPEN),
      ).toBe(true);
      expect(
        DisputeStateMachine.allowsEvidenceSubmission(
          DisputeStatus.EVIDENCE_COLLECTION,
        ),
      ).toBe(true);
      expect(
        DisputeStateMachine.allowsEvidenceSubmission(DisputeStatus.RESOLVED),
      ).toBe(false);
    });
  });
});
