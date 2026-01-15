# Development Rules

## Dialog Boxes

**⚠️ CRITICAL RULE: NEVER use browser-native dialog boxes (`alert()`, `confirm()`, `prompt()`) in the application.**

**This is a hard rule with zero exceptions. Any usage of these functions is considered a bug and must be fixed immediately.**

### Why?
- Browser dialog boxes block the UI thread and provide a poor user experience
- They cannot be styled to match the application design
- They are not accessible and don't work well with screen readers
- They interrupt the user flow unnecessarily

### Pre-Commit Checklist
Before committing any code, verify:
- ✅ No `alert()`, `confirm()`, or `prompt()` calls exist in your changes
- ✅ Run ESLint to catch any violations (`no-alert` rule)
- ✅ If you need user confirmation, use `<ConfirmDialog>` component
- ✅ If you need to show messages, use `<Notification>` component

### Instead, use:
1. **Notifications** - For informational messages, errors, warnings, or success messages
   - Use the `<Notification>` component from `@/components/Notification`
   - Auto-dismiss after a few seconds
   - Non-blocking

2. **Confirm Dialogs** - For user confirmation actions
   - Use the `<ConfirmDialog>` component from `@/components/ConfirmDialog`
   - Styled to match the application
   - Accessible and customizable

3. **Inline Validation** - For form validation errors
   - Show errors directly in the form
   - Use red text or error states

### Examples:

❌ **Don't:**
```typescript
if (!value) {
  alert('Value is required');
  return;
}

if (confirm('Are you sure?')) {
  deleteItem();
}
```

✅ **Do:**
```typescript
if (!value) {
  setNotification({ message: 'Value is required', type: 'error' });
  return;
}

setConfirmDialog({
  message: 'Are you sure?',
  onConfirm: () => deleteItem(),
});
```

### ESLint Rule
The project includes an ESLint rule `no-alert` that will flag any usage of `alert()`, `confirm()`, or `prompt()`.
