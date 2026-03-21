const PIN_TYPE = {
    LED: 'LED',
    SWITCH: 'SWITCH',
    DIGIT_SEGMENT: 'DIGIT_SEGMENT',
    DIGIT_SELECT: 'DIGIT_SELECT',
    BUTTON_INDEPENDENT: 'BUTTON_INDEPENDENT',
    BUTTON_MATRIX_COL: 'BUTTON_MATRIX_COL',
    BUTTON_MATRIX_ROW: 'BUTTON_MATRIX_ROW',
    BUZZER: 'BUZZER',
    BUTTON_A7: 'BUTTON_A7'
};

const PIN_CONFIG = {
    // 01-32: 32个LED灯
    LED: {
        type: PIN_TYPE.LED,
        range: [1, 32],
        count: 32
    },
    // 33-64: 32个拨码开关
    SWITCH: {
        type: PIN_TYPE.SWITCH,
        range: [33, 64],
        count: 32
    },
    // 65-71: 7段数码管 a-g
    DIGIT_SEGMENT: {
        type: PIN_TYPE.DIGIT_SEGMENT,
        range: [65, 71],
        count: 7,
        mapping: { a: 65, b: 66, c: 67, d: 68, e: 69, f: 70, g: 71 }
    },
    // 72-87: 16个数码管位选
    DIGIT_SELECT: {
        type: PIN_TYPE.DIGIT_SELECT,
        range: [72, 87],
        count: 16
    },
    // 88-91: 4个独立按键
    BUTTON_INDEPENDENT: {
        type: PIN_TYPE.BUTTON_INDEPENDENT,
        range: [88, 91],
        count: 4
    },
    // 92-95: 矩阵按键列
    BUTTON_MATRIX_COL: {
        type: PIN_TYPE.BUTTON_MATRIX_COL,
        range: [92, 95],
        count: 4
    },
    // 96-99: 矩阵按键行
    BUTTON_MATRIX_ROW: {
        type: PIN_TYPE.BUTTON_MATRIX_ROW,
        range: [96, 99],
        count: 4
    },
    // 100: 蜂鸣器
    BUZZER: {
        type: PIN_TYPE.BUZZER,
        range: [100, 100],
        count: 1
    },
    // 101-102: 两个A7独立按键
    BUTTON_A7: {
        type: PIN_TYPE.BUTTON_A7,
        range: [101, 102],
        count: 2
    }
};

const PIN_NAME_TO_ID = {
    // LED灯 (01-32)
    LED0: 1, LED1: 2, LED2: 3, LED3: 4, LED4: 5, LED5: 6, LED6: 7, LED7: 8,
    LED8: 9, LED9: 10, LED10: 11, LED11: 12, LED12: 13, LED13: 14, LED14: 15, LED15: 16,
    LED16: 17, LED17: 18, LED18: 19, LED19: 20, LED20: 21, LED21: 22, LED22: 23, LED23: 24,
    LED24: 25, LED25: 26, LED26: 27, LED27: 28, LED28: 29, LED29: 30, LED30: 31, LED31: 32,

    // 拨码开关 (33-64)
    SW0: 33, SW1: 34, SW2: 35, SW3: 36, SW4: 37, SW5: 38, SW6: 39, SW7: 40,
    SW8: 41, SW9: 42, SW10: 43, SW11: 44, SW12: 45, SW13: 46, SW14: 47, SW15: 48,
    SW16: 49, SW17: 50, SW18: 51, SW19: 52, SW20: 53, SW21: 54, SW22: 55, SW23: 56,
    SW24: 57, SW25: 58, SW26: 59, SW27: 60, SW28: 61, SW29: 62, SW30: 63, SW31: 64,

    // 7段数码管段选 (65-71)
    SEG_A: 65, SEG_B: 66, SEG_C: 67, SEG_D: 68, SEG_E: 69, SEG_F: 70, SEG_G: 71,
    DIGIT_A: 65, DIGIT_B: 66, DIGIT_C: 67, DIGIT_D: 68, DIGIT_E: 69, DIGIT_F: 70, DIGIT_G: 71,

    // 数码管位选 (72-87)
    DIG0: 72, DIG1: 73, DIG2: 74, DIG3: 75, DIG4: 76, DIG5: 77, DIG6: 78, DIG7: 79,
    DIG8: 80, DIG9: 81, DIG10: 82, DIG11: 83, DIG12: 84, DIG13: 85, DIG14: 86, DIG15: 87,

    // 独立按键 (88-91)
    BTN0: 88, BTN1: 89, BTN2: 90, BTN3: 91,
    KEY0: 88, KEY1: 89, KEY2: 90, KEY3: 91,

    // 矩阵按键列 (92-95)
    COL0: 92, COL1: 93, COL2: 94, COL3: 95,

    // 矩阵按键行 (96-99)
    ROW0: 96, ROW1: 97, ROW2: 98, ROW3: 99,

    // 蜂鸣器 (100)
    BUZZER: 100, BEEP: 100,

    // A7独立按键 (101-102)
    A7_BTN0: 101, A7_BTN1: 102,
    A7_KEY0: 101, A7_KEY1: 102
};

const PIN_ID_TO_NAME = {};
for (const [name, id] of Object.entries(PIN_NAME_TO_ID)) {
    PIN_ID_TO_NAME[id] = name;
}

const PIN_ID_TO_TYPE = {};
for (const [name, id] of Object.entries(PIN_NAME_TO_ID)) {
    if (name.startsWith('LED')) PIN_ID_TO_TYPE[id] = PIN_TYPE.LED;
    else if (name.startsWith('SW')) PIN_ID_TO_TYPE[id] = PIN_TYPE.SWITCH;
    else if (name.startsWith('SEG_') || name.startsWith('DIGIT_') && parseInt(name.replace(/\D/g, '')) <= 7) {
        if (name.includes('A') || name.includes('B') || name.includes('C') || name.includes('D') || name.includes('E') || name.includes('F') || name.includes('G')) {
            PIN_ID_TO_TYPE[id] = PIN_TYPE.DIGIT_SEGMENT;
        }
    }
    else if (name.startsWith('DIG')) PIN_ID_TO_TYPE[id] = PIN_TYPE.DIGIT_SELECT;
    else if (name.startsWith('BTN') || name.startsWith('KEY')) PIN_ID_TO_TYPE[id] = PIN_TYPE.BUTTON_INDEPENDENT;
    else if (name.startsWith('COL')) PIN_ID_TO_TYPE[id] = PIN_TYPE.BUTTON_MATRIX_COL;
    else if (name.startsWith('ROW')) PIN_ID_TO_TYPE[id] = PIN_TYPE.BUTTON_MATRIX_ROW;
    else if (name.startsWith('BUZZER') || name.startsWith('BEEP')) PIN_ID_TO_TYPE[id] = PIN_TYPE.BUZZER;
    else if (name.startsWith('A7_')) PIN_ID_TO_TYPE[id] = PIN_TYPE.BUTTON_A7;
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
        if (pinId !== null && pinId >= 1 && pinId <= 102) {
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
