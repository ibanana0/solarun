/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/solarun_temp.json`.
 */
export type SolarunTemp = {
  "address": "E8KF9A7PiYbi3UmZTDy4RFnJYsvjmo3oQ7NwTuGzR2C8",
  "metadata": {
    "name": "solarunTemp",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "closeParticipant",
      "docs": [
        "Close a participant PDA to reclaim rent"
      ],
      "discriminator": [
        192,
        162,
        92,
        5,
        148,
        191,
        207,
        151
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "event"
              },
              {
                "kind": "arg",
                "path": "chipUid"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        },
        {
          "name": "chipUid",
          "type": "string"
        }
      ]
    },
    {
      "name": "completeRace",
      "docs": [
        "Complete a race (transition from Active to Completed)"
      ],
      "discriminator": [
        251,
        40,
        105,
        128,
        3,
        79,
        193,
        69
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        }
      ]
    },
    {
      "name": "createMockMint",
      "docs": [
        "Create the global Mock USDC mint (one-time setup)"
      ],
      "discriminator": [
        186,
        150,
        36,
        212,
        159,
        183,
        46,
        144
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "mockUsdcMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  99,
                  107,
                  95,
                  117,
                  115,
                  100,
                  99,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "deleteEvent",
      "docs": [
        "Delete an event and return remaining funds"
      ],
      "discriminator": [
        103,
        111,
        95,
        106,
        232,
        24,
        190,
        84
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Vault token account to be closed."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "event"
              }
            ]
          }
        },
        {
          "name": "adminTokenAccount",
          "docs": [
            "Admin's USDC token account to receive remaining funds."
          ],
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        }
      ]
    },
    {
      "name": "initializeEvent",
      "docs": [
        "Initialize a new event with USDC vault"
      ],
      "discriminator": [
        126,
        249,
        86,
        221,
        202,
        171,
        134,
        20
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        },
        {
          "name": "mockUsdcMint",
          "docs": [
            "The Mock USDC mint (must already exist via create_mock_mint)."
          ]
        },
        {
          "name": "vault",
          "docs": [
            "Vault token account: holds USDC deposits for this event.",
            "Authority is the event PDA so the program can transfer out via PDA signing."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "event"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        },
        {
          "name": "maxParticipants",
          "type": "u32"
        },
        {
          "name": "registrationFee",
          "type": "u64"
        },
        {
          "name": "startTime",
          "type": "i64"
        },
        {
          "name": "endTime",
          "type": "i64"
        }
      ]
    },
    {
      "name": "mintMockUsdc",
      "docs": [
        "Faucet: mint Mock USDC to a user's token account"
      ],
      "discriminator": [
        168,
        64,
        97,
        102,
        69,
        152,
        108,
        251
      ],
      "accounts": [
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "mockUsdcMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  111,
                  99,
                  107,
                  95,
                  117,
                  115,
                  100,
                  99,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              }
            ]
          }
        },
        {
          "name": "mintAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "userTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "mockUsdcMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "processRefunds",
      "docs": [
        "Process refunds and prize distribution (USDC) for completed event"
      ],
      "discriminator": [
        48,
        71,
        147,
        50,
        208,
        8,
        196,
        155
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "docs": [
            "Vault token account holding deposited USDC."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "event"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        },
        {
          "name": "finishers",
          "type": {
            "vec": {
              "defined": {
                "name": "finisherData"
              }
            }
          }
        },
        {
          "name": "nonFinishers",
          "type": {
            "vec": "string"
          }
        },
        {
          "name": "recipientWallets",
          "type": {
            "vec": "pubkey"
          }
        },
        {
          "name": "amounts",
          "type": {
            "vec": "u64"
          }
        },
        {
          "name": "isFinalBatch",
          "type": "bool"
        }
      ]
    },
    {
      "name": "recordFinish",
      "docs": [
        "Record checkpoint completion for a participant"
      ],
      "discriminator": [
        180,
        171,
        76,
        87,
        133,
        29,
        88,
        43
      ],
      "accounts": [
        {
          "name": "backend",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "event"
              },
              {
                "kind": "arg",
                "path": "chipUid"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        },
        {
          "name": "chipUid",
          "type": "string"
        },
        {
          "name": "checkpointId",
          "type": "u8"
        },
        {
          "name": "finishPosition",
          "type": "u8"
        },
        {
          "name": "timestamp",
          "type": "i64"
        }
      ]
    },
    {
      "name": "registerParticipant",
      "docs": [
        "Register a participant for an event (pays USDC fee)"
      ],
      "discriminator": [
        248,
        112,
        38,
        215,
        226,
        230,
        249,
        40
      ],
      "accounts": [
        {
          "name": "runner",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        },
        {
          "name": "participant",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  97,
                  114,
                  116,
                  105,
                  99,
                  105,
                  112,
                  97,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "event"
              },
              {
                "kind": "arg",
                "path": "chipUid"
              }
            ]
          }
        },
        {
          "name": "runnerTokenAccount",
          "docs": [
            "Runner's USDC token account (source of registration fee)"
          ],
          "writable": true
        },
        {
          "name": "vault",
          "docs": [
            "Vault token account (destination of registration fee)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "event"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        },
        {
          "name": "chipUid",
          "type": "string"
        },
        {
          "name": "walletAddress",
          "type": "pubkey"
        },
        {
          "name": "fullName",
          "type": "string"
        },
        {
          "name": "runnerId",
          "type": "string"
        }
      ]
    },
    {
      "name": "startRace",
      "docs": [
        "Start a race (transition from Initialized to Active)"
      ],
      "discriminator": [
        167,
        209,
        181,
        53,
        90,
        108,
        220,
        120
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "event",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  118,
                  101,
                  110,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "eventId"
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "eventId",
          "type": "string"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "event",
      "discriminator": [
        125,
        192,
        125,
        158,
        9,
        115,
        152,
        233
      ]
    },
    {
      "name": "participant",
      "discriminator": [
        32,
        142,
        108,
        79,
        247,
        179,
        54,
        6
      ]
    }
  ],
  "events": [
    {
      "name": "checkpointRecorded",
      "discriminator": [
        157,
        192,
        91,
        196,
        149,
        33,
        47,
        247
      ]
    },
    {
      "name": "eventDeleted",
      "discriminator": [
        140,
        28,
        249,
        192,
        46,
        170,
        15,
        241
      ]
    },
    {
      "name": "eventInitialized",
      "discriminator": [
        197,
        198,
        222,
        150,
        59,
        160,
        192,
        234
      ]
    },
    {
      "name": "participantRegistered",
      "discriminator": [
        47,
        115,
        159,
        109,
        135,
        121,
        70,
        193
      ]
    },
    {
      "name": "refundsProcessed",
      "discriminator": [
        29,
        249,
        63,
        168,
        81,
        85,
        99,
        6
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "endTimeInvalid",
      "msg": "E0001: End time must be after start time"
    },
    {
      "code": 6001,
      "name": "vaultCapacityZero",
      "msg": "E0002: Vault capacity must be greater than zero"
    },
    {
      "code": 6002,
      "name": "invalidEventId",
      "msg": "E0003: Invalid event ID (empty or too long, max 36 chars)"
    },
    {
      "code": 6003,
      "name": "eventAlreadyStarted",
      "msg": "E0004: Event has already been started"
    },
    {
      "code": 6004,
      "name": "eventNotFound",
      "msg": "E0010: Event not found"
    },
    {
      "code": 6005,
      "name": "eventNotActive",
      "msg": "E0011: Event is not in Active or Initialized status"
    },
    {
      "code": 6006,
      "name": "chipUidAlreadyExists",
      "msg": "E0012: Chip UID already exists in this event"
    },
    {
      "code": 6007,
      "name": "walletAlreadyRegistered",
      "msg": "E0013: Wallet address already registered for this event"
    },
    {
      "code": 6008,
      "name": "invalidChipUid",
      "msg": "E0014: Invalid chip UID (empty or too long, max 20 chars)"
    },
    {
      "code": 6009,
      "name": "maxParticipantsReached",
      "msg": "Maximum participants reached"
    },
    {
      "code": 6010,
      "name": "finishEventNotFound",
      "msg": "E0020: Event not found for finish recording"
    },
    {
      "code": 6011,
      "name": "finishEventNotActive",
      "msg": "E0021: Event is not in Active status"
    },
    {
      "code": 6012,
      "name": "participantNotFound",
      "msg": "E0022: Participant not found for this event"
    },
    {
      "code": 6013,
      "name": "invalidCheckpointId",
      "msg": "E0023: Invalid checkpoint ID (must be 0, 1, or 2)"
    },
    {
      "code": 6014,
      "name": "participantAlreadyFinished",
      "msg": "E0024: Participant has already finished, cannot record duplicate finish"
    },
    {
      "code": 6015,
      "name": "refundEventNotFound",
      "msg": "E0030: Event not found for refund processing"
    },
    {
      "code": 6016,
      "name": "eventNotCompleted",
      "msg": "E0031: Event must be Completed before processing refunds"
    },
    {
      "code": 6017,
      "name": "vaultEmpty",
      "msg": "E0032: Vault is empty, cannot process refunds"
    },
    {
      "code": 6018,
      "name": "invalidFinisherPosition",
      "msg": "E0033: Invalid finisher position"
    },
    {
      "code": 6019,
      "name": "transferFailed",
      "msg": "E0034: Transfer to participant failed"
    },
    {
      "code": 6020,
      "name": "arithmeticOverflow",
      "msg": "E0035: Arithmetic overflow in prize calculation"
    },
    {
      "code": 6021,
      "name": "invalidWalletAddress",
      "msg": "E0036: Invalid wallet address (zero address)"
    },
    {
      "code": 6022,
      "name": "unauthorizedAdmin",
      "msg": "E0040: Unauthorized signer (not admin)"
    },
    {
      "code": 6023,
      "name": "unauthorizedBackend",
      "msg": "E0041: Unauthorized signer (not backend)"
    },
    {
      "code": 6024,
      "name": "invalidFullName",
      "msg": "E0050: Invalid full name (empty or too long, max 50 chars)"
    },
    {
      "code": 6025,
      "name": "invalidRunnerId",
      "msg": "E0051: Invalid runner ID (empty or too long, max 36 chars)"
    },
    {
      "code": 6026,
      "name": "invalidWalletFormat",
      "msg": "E0052: Invalid wallet address format"
    },
    {
      "code": 6027,
      "name": "eventNotInitialized",
      "msg": "Event must be in Initialized status to register"
    },
    {
      "code": 6028,
      "name": "eventNotActiveForFinish",
      "msg": "Event must be in Active status to record finish"
    },
    {
      "code": 6029,
      "name": "eventNotCompletedForRefund",
      "msg": "Event must be in Completed status to process refunds"
    }
  ],
  "types": [
    {
      "name": "checkpointRecorded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eventId",
            "type": "string"
          },
          {
            "name": "chipUid",
            "type": "string"
          },
          {
            "name": "checkpointId",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "event",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eventId",
            "type": "string"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "eventStatus"
              }
            }
          },
          {
            "name": "participantCount",
            "type": "u32"
          },
          {
            "name": "maxParticipants",
            "type": "u32"
          },
          {
            "name": "totalDeposits",
            "type": "u64"
          },
          {
            "name": "registrationFee",
            "type": "u64"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "eventDeleted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eventId",
            "type": "string"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "remainingReturned",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "eventInitialized",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eventId",
            "type": "string"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "maxParticipants",
            "type": "u32"
          },
          {
            "name": "startTime",
            "type": "i64"
          },
          {
            "name": "endTime",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "eventStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "initialized"
          },
          {
            "name": "active"
          },
          {
            "name": "completed"
          },
          {
            "name": "settled"
          }
        ]
      }
    },
    {
      "name": "finisherData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "chipUid",
            "type": "string"
          },
          {
            "name": "position",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "participant",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "runnerId",
            "type": "string"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "chipUid",
            "type": "string"
          },
          {
            "name": "fullName",
            "type": "string"
          },
          {
            "name": "finishPosition",
            "type": {
              "option": "u8"
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "participantStatus"
              }
            }
          },
          {
            "name": "registeredAt",
            "type": "i64"
          },
          {
            "name": "finishedAt",
            "type": {
              "option": "i64"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "participantRegistered",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eventId",
            "type": "string"
          },
          {
            "name": "wallet",
            "type": "pubkey"
          },
          {
            "name": "chipUid",
            "type": "string"
          },
          {
            "name": "feePaid",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "participantStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "registered"
          },
          {
            "name": "running"
          },
          {
            "name": "finished"
          },
          {
            "name": "disqualified"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "refundsProcessed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "eventId",
            "type": "string"
          },
          {
            "name": "totalDistributed",
            "type": "u64"
          },
          {
            "name": "finisherCount",
            "type": "u32"
          },
          {
            "name": "nonFinisherCount",
            "type": "u32"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "seed",
      "type": "string",
      "value": "\"anchor\""
    }
  ]
};
