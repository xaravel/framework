<?php

declare(strict_types=1);

test('adds numbers', function () {
    expect(1 + 1)->toBe(2);
    expect(true)->toBeTrue();
});

describe('math', function () {
    it('multiplies', function () {
        expect(2 * 3)->toBe(6);
    });
});

test('doubles', function (int $number, int $double) {
    expect($number * 2)->toBe($double);
})->with([
    'one' => [1, 2],
    'two' => [2, 4],
]);

test('is skipped', function () {
    expect(true)->toBeTrue();
})->skip('skipped by the fixture');

test('fails', function () {
    expect(1)->toBe(2);
});
