const assert = require("node:assert/strict");
const test = require("node:test");

const controllerPath = require.resolve("./storyController");
const storyModelPath = require.resolve("../models/storyModel");
const storageServicePath = require.resolve("../services/storageService");

function loadStoryControllerWithModel(storyModel) {
  delete require.cache[controllerPath];
  require.cache[storyModelPath] = {
    id: storyModelPath,
    filename: storyModelPath,
    loaded: true,
    exports: storyModel,
  };
  require.cache[storageServicePath] = {
    id: storageServicePath,
    filename: storageServicePath,
    loaded: true,
    exports: {
      uploadBufferToUploadsBucket() {
        return Promise.resolve("");
      },
    },
  };

  return require("./storyController");
}

function restoreStoryModel(t) {
  const originalStoryModel = require.cache[storyModelPath];
  const originalStorageService = require.cache[storageServicePath];
  t.after(() => {
    delete require.cache[controllerPath];
    if (originalStoryModel) {
      require.cache[storyModelPath] = originalStoryModel;
    } else {
      delete require.cache[storyModelPath];
    }
    if (originalStorageService) {
      require.cache[storageServicePath] = originalStorageService;
    } else {
      delete require.cache[storageServicePath];
    }
  });
}

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

test("feed passes the authenticated user id to the story model", async (t) => {
  restoreStoryModel(t);

  const calls = [];
  const storyController = loadStoryControllerWithModel({
    feedActiveByUser(args) {
      calls.push(args);
      return Promise.resolve([]);
    },
  });
  const req = {
    user: { userId: "viewer-1" },
    logger: { error() {} },
  };
  const res = createResponse();

  await storyController.feed(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { users: [] });
  assert.deepEqual(calls, [{ viewerUserId: "viewer-1" }]);
});
