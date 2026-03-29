const PIN_TYPE = {
    LED: 'LED',
    SWITCH: 'SWITCH',
    DIGIT_SEGMENT: 'DIGIT_SEGMENT',
    DIGIT_SELECT: 'DIGIT_SELECT',
    BUTTON_INDEPENDENT: 'BUTTON_INDEPENDENT',
    BUZZER: 'BUZZER'
};

const PIN_CONFIG = {
    LED: {
        type: PIN_TYPE.LED,
        range: [1, 16],
        count: 16
    },
    SWITCH: {
        type: PIN_TYPE.SWITCH,
        range: [17, 32],
        count: 16
    },
    DIGIT_SEGMENT: {
        type: PIN_TYPE.DIGIT_SEGMENT,
        range: [33, 39],
        count: 7,
        mapping: { a: 33, b: 34, c: 35, d: 36, e: 37, f: 38, g: 39 }
    },
    DIGIT_SELECT: {
        type: PIN_TYPE.DIGIT_SELECT,
        range: [40, 47],
        count: 8
    },
    BUTTON_INDEPENDENT: {
        type: PIN_TYPE.BUTTON_INDEPENDENT,
        range: [48, 53],
        count: 6
    },
    BUZZER: {
        type: PIN_TYPE.BUZZER,
        range: [54, 54],
        count: 1
    }
};

const PIN_NAME_TO_ID = {
    LED0: 1, LED1: 2, LED2: 3, LED3: 4, LED4: 5, LED5: 6, LED6: 7, LED7: 8,
    LED8: 9, LED9: 10, LED10: 11, LED11: 12, LED12: 13, LED13: 14, LED14: 15, LED15: 16,

    SW0: 17, SW1: 18, SW2: 19, SW3: 20, SW4: 21, SW5: 22, SW6: 23, SW7: 24,
    SW8: 25, SW9: 26, SW10: 27, SW11: 28, SW12: 29, SW13: 30, SW14: 31, SW15: 32,

    SEG_A: 33, SEG_B: 34, SEG_C: 35, SEG_D: 36, SEG_E: 37, SEG_F: 38, SEG_G: 39,
    DIGIT_A: 33, DIGIT_B: 34, DIGIT_C: 35, DIGIT_D: 36, DIGIT_E: 37, DIGIT_F: 38, DIGIT_G: 39,

    DIG0: 40, DIG1: 41, DIG2: 42, DIG3: 43, DIG4: 44, DIG5: 45, DIG6: 46, DIG7: 47,

    BTN0: 48, BTN1: 49, BTN2: 50, BTN3: 51, BTN4: 52, BTN5: 53,
    KEY0: 48, KEY1: 49, KEY2: 50, KEY3: 51, KEY4: 52, KEY5: 53,

    BUZZER: 54, BEEP: 54
};

const PIN_ID_TO_NAME = {};
for (const [name, id] of Object.entries(PIN_NAME_TO_ID)) {
    PIN_ID_TO_NAME[id] = name;
}

const PIN_ID_TO_TYPE = {};
for (const [name, id] of Object.entries(PIN_NAME_TO_ID)) {
    if (name.startsWith('LED')) PIN_ID_TO_TYPE[id] = PIN_TYPE.LED;
    else if (name.startsWith('SW')) PIN_ID_TO_TYPE[id] = PIN_TYPE.SWITCH;
    else if (name.startsWith('SEG_') || name.startsWith('DIGIT_')) {
        if (name.includes('A') || name.includes('B') || name.includes('C') || name.includes('D') || name.includes('E') || name.includes('F') || name.includes('G')) {
            PIN_ID_TO_TYPE[id] = PIN_TYPE.DIGIT_SEGMENT;
        }
    }
    else if (name.startsWith('DIG')) PIN_ID_TO_TYPE[id] = PIN_TYPE.DIGIT_SELECT;
    else if (name.startsWith('BTN') || name.startsWith('KEY')) PIN_ID_TO_TYPE[id] = PIN_TYPE.BUTTON_INDEPENDENT;
    else if (name.startsWith('BUZZER') || name.startsWith('BEEP')) PIN_ID_TO_TYPE[id] = PIN_TYPE.BUZZER;
}

function getPinId(pinName) {
    if (typeof pinName === 'number') return pinName;
    return PIN_NAME_TO_ID[pinName] || null;
}

function getPinName(pinId) {
    return PIN_ID_TO_NAME[pinId] || null;
}

function getPinType(pinId) {
    if (typeof pinId === 'string') {
        pinId = getPinId(pinId);
    }
    return PIN_ID_TO_TYPE[pinId] || null;
}

function validatePinIds(pinIds) {
    const validIds = [];
    const invalidPins = [];

    for (const pin of pinIds) {
        const pinId = getPinId(pin);
        if (pinId !== null && pinId >= 1 && pinId <= 54) {
            validIds.push(pinId);
        } else {
            invalidPins.push(pin);
        }
    }

    return { validIds, invalidPins };
}

module.exports = {
    PIN_TYPE,
    PIN_CONFIG,
    PIN_NAME_TO_ID,
    PIN_ID_TO_NAME,
    PIN_ID_TO_TYPE,
    getPinId,
    getPinName,
    getPinType,
    validatePinIds
};