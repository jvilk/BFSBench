define([], function() {
  return function(arg1) {
    if (!arg1) {
      throw new Error("Assertion failed.");
    }
  };
});