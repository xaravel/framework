<?php

// The tokenizer sees `interface Odd`, but the file declares Odd as a class:
// the interfaces mode must fail on it rather than export a class.

namespace PsrOdd;

if (false) {
    interface Odd
    {
    }
}

class Odd
{
}
