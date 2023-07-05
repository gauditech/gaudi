"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATA = void 0;
exports.DATA = [
    {
        model: "AuthUser",
        data: [
            {
                name: "First",
                username: "first",
                passwordHash: "$2b$10$TQpDb3kHc3yLLwtQlM3Rve/ZhUPF7ZZ3WdZ90OxygOCmb7YH.AT86",
            },
            {
                // id: 2,
                name: "Second",
                username: "second",
                passwordHash: "$2b$10$TQpDb3kHc3yLLwtQlM3Rve/ZhUPF7ZZ3WdZ90OxygOCmb7YH.AT86",
            },
        ],
    },
    {
        model: "AuthUserAccessToken",
        data: [
            {
                authUser_id: 1,
                token: "6Jty8G-HtB9CmB9xqRkJ3Z9LY5_or7pACnAQ6dERc1U",
                expiryDate: "".concat(Date.now() + 1 * 60 * 60 * 1000),
            },
            {
                authUser_id: 2,
                token: "FwExbO7sVwf95pI3F3qWSpkANE4aeoNiI0pogqiMcfQ",
                expiryDate: "".concat(Date.now() + 1 * 60 * 60 * 1000),
            },
        ],
    },
    {
        model: "Box",
        data: [
            { owner_id: 1, name: "public", is_public: true },
            { owner_id: 1, name: "private", is_public: false },
        ],
    },
    {
        model: "Item",
        data: [
            { box_id: 1, name: "public", is_public: true },
            { box_id: 1, name: "private", is_public: false },
            { box_id: 2, name: "public2", is_public: true },
            { box_id: 2, name: "private2", is_public: false },
        ],
    },
];
