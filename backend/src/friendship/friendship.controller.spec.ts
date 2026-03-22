import { Test, TestingModule } from "@nestjs/testing";
import { FriendshipController } from "./friendship.controller";
import { FriendshipService } from "./provider/service";

describe("FriendshipController", () => {
  let controller: FriendshipController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FriendshipController],
      providers: [
        {
          provide: FriendshipService,
          useValue: {
            getFriends: jest.fn(),
            addFriend: jest.fn(),
            removeFriend: jest.fn(),
            getPendingRequests: jest.fn(),
            acceptRequest: jest.fn(),
            declineRequest: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FriendshipController>(FriendshipController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
