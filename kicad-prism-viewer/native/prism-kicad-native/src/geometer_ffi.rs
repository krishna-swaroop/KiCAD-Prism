use anyhow::Result;

#[cfg(geometer_sdk)]
mod linked {
    use anyhow::{Result, bail};
    use std::ffi::{CStr, c_char};
    use std::ptr;

    unsafe extern "C" {
        fn geometer_clipper2_boolean_bytes(
            request_data: *const u8,
            request_size: usize,
            value: *mut *mut u8,
            value_size: *mut usize,
            error: *mut *mut c_char,
        ) -> i32;
        fn geometer_free_string(value: *mut c_char);
        fn geometer_free_bytes(value: *mut u8);
    }

    struct OwnedBytes(*mut u8);

    impl Drop for OwnedBytes {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: Geometer returned this allocation to the matching free function.
                unsafe { geometer_free_bytes(self.0) };
            }
        }
    }

    struct OwnedString(*mut c_char);

    impl OwnedString {
        fn take(&mut self) -> String {
            if self.0.is_null() {
                return String::new();
            }
            // SAFETY: Geometer error strings are NUL terminated and owned by the caller.
            let value = unsafe { CStr::from_ptr(self.0) }
                .to_string_lossy()
                .into_owned();
            // SAFETY: the pointer is live and has not yet been freed.
            unsafe { geometer_free_string(self.0) };
            self.0 = ptr::null_mut();
            value
        }
    }

    impl Drop for OwnedString {
        fn drop(&mut self) {
            if !self.0.is_null() {
                // SAFETY: Geometer returned this allocation to the matching free function.
                unsafe { geometer_free_string(self.0) };
            }
        }
    }

    pub fn boolean(request: &[u8]) -> Result<Vec<u8>> {
        let mut value = OwnedBytes(ptr::null_mut());
        let mut size = 0usize;
        let mut error = OwnedString(ptr::null_mut());
        // SAFETY: the request slice is live for the synchronous call and output holders are valid.
        let code = unsafe {
            geometer_clipper2_boolean_bytes(
                request.as_ptr(),
                request.len(),
                &mut value.0,
                &mut size,
                &mut error.0,
            )
        };
        if code != 0 {
            bail!(
                "Geometer Clipper2 boolean failed with code {code}: {}",
                error.take()
            );
        }
        if size != 0 && value.0.is_null() {
            bail!("Geometer returned an invalid boolean response pointer");
        }
        if size == 0 {
            return Ok(Vec::new());
        }
        // SAFETY: Geometer owns at least `size` readable bytes until OwnedBytes drops.
        Ok(unsafe { std::slice::from_raw_parts(value.0, size) }.to_vec())
    }
}

pub fn available() -> bool {
    cfg!(geometer_sdk)
}

pub fn clipper2_boolean(request: &[u8]) -> Result<Vec<u8>> {
    #[cfg(geometer_sdk)]
    {
        linked::boolean(request)
    }
    #[cfg(not(geometer_sdk))]
    {
        let _ = request;
        anyhow::bail!(
            "native terminal clipping requires a Geometer SDK-linked helper; rebuild with GEOMETER_SDK_DIR"
        )
    }
}
